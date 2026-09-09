"""Frozen PostgreSQL triggers for v1; used only by Alembic, not request handlers."""

FUNCTIONS = [r"""
CREATE FUNCTION p5_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable historical record: %', TG_TABLE_NAME USING ERRCODE='23514';
END $$
""", r"""
CREATE FUNCTION p5_seal_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'historical input cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF OLD.sealed_at IS NOT NULL OR NEW.sealed_at IS NULL OR
     (to_jsonb(OLD)-'sealed_at') IS DISTINCT FROM (to_jsonb(NEW)-'sealed_at') THEN
    RAISE EXCEPTION 'only initial sealing is allowed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$
""", r"""
CREATE FUNCTION p5_input_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sealed timestamptz; state text;
BEGIN
  IF TG_TABLE_NAME='responses' THEN
    SELECT sealed_at INTO sealed FROM imports WHERE id=NEW.import_id FOR UPDATE;
    IF NOT FOUND OR sealed IS NOT NULL THEN
      RAISE EXCEPTION 'import missing or already sealed' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='snapshot_members' THEN
    SELECT sealed_at INTO sealed FROM input_snapshots WHERE id=NEW.snapshot_id FOR UPDATE;
    IF NOT FOUND OR sealed IS NOT NULL THEN
      RAISE EXCEPTION 'snapshot missing or already sealed' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT status INTO state FROM consultations WHERE id=NEW.consultation_id FOR SHARE;
    IF NOT FOUND OR state <> 'ACTIVE' THEN
      RAISE EXCEPTION 'consultation must be active' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$
""", r"""
CREATE FUNCTION p5_check_sealed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected integer; actual integer; last_row integer; sealed timestamptz; payload jsonb; assembled jsonb;
BEGIN
  IF TG_TABLE_NAME='imports' THEN
    SELECT record_count,sealed_at INTO expected,sealed FROM imports WHERE id=NEW.id;
    SELECT count(*),max(record_ordinal) INTO actual,last_row FROM responses WHERE import_id=NEW.id;
  ELSE
    SELECT member_count,sealed_at,logical_payload INTO expected,sealed,payload FROM input_snapshots WHERE id=NEW.id;
    SELECT count(*),max(m.row_index),jsonb_agg(r.logical_record ORDER BY m.row_index)
      INTO actual,last_row,assembled FROM snapshot_members m JOIN responses r ON r.id=m.response_id WHERE m.snapshot_id=NEW.id;
    IF payload IS DISTINCT FROM assembled THEN
      RAISE EXCEPTION 'snapshot payload differs from ordered membership' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM snapshot_members m JOIN responses r ON r.id=m.response_id
               JOIN imports i ON i.id=r.import_id WHERE m.snapshot_id=NEW.id AND i.sealed_at IS NULL) THEN
      RAISE EXCEPTION 'snapshot imports must be sealed' USING ERRCODE='23514';
    END IF;
  END IF;
  IF sealed IS NULL OR actual <> expected OR last_row <> expected THEN
    RAISE EXCEPTION 'input must be completely populated and sealed in its creation transaction' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$
""", r"""
CREATE FUNCTION p5_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent analysis_runs%ROWTYPE; snapshot input_snapshots%ROWTYPE; state text;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'runs cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO snapshot FROM input_snapshots WHERE id=NEW.snapshot_id;
    SELECT status INTO state FROM consultations WHERE id=NEW.consultation_id FOR SHARE;
    IF snapshot.sealed_at IS NULL OR state IS DISTINCT FROM 'ACTIVE' OR NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'new run requires sealed snapshot, active consultation and PENDING state' USING ERRCODE='23514';
    END IF;
    IF NEW.retry_of_run_id IS NOT NULL THEN
      SELECT * INTO parent FROM analysis_runs WHERE id=NEW.retry_of_run_id;
      IF parent.status IS DISTINCT FROM 'FAILED' OR parent.model_manifest IS DISTINCT FROM NEW.model_manifest
         OR parent.snapshot_id IS DISTINCT FROM NEW.snapshot_id THEN
        RAISE EXCEPTION 'retry requires failed run with same snapshot and manifest' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSE
    IF (to_jsonb(OLD)-ARRAY['status','started_at','ended_at','failure','result_json','result_hash'])
       IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','started_at','ended_at','failure','result_json','result_hash'])
       OR NOT ((OLD.status='PENDING' AND NEW.status IN ('RUNNING','FAILED'))
           OR (OLD.status='RUNNING' AND NEW.status IN ('COMPLETED','FAILED'))) THEN
      RAISE EXCEPTION 'invalid transition or immutable run identity' USING ERRCODE='23514';
    END IF;
    IF OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN
      RAISE EXCEPTION 'start time is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$
""", r"""
CREATE FUNCTION p5_result_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state text; original text;
BEGIN
  SELECT status INTO state FROM analysis_runs WHERE id=NEW.run_id FOR UPDATE;
  IF state IS DISTINCT FROM 'RUNNING' THEN
    RAISE EXCEPTION 'result writes require RUNNING run' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='finding_evidence' THEN
   IF NEW.quote_text IS NOT NULL THEN
    SELECT r.original_text INTO original FROM run_responses rr
      JOIN snapshot_members sm ON sm.snapshot_id=rr.snapshot_id AND sm.row_index=rr.row_index
      JOIN responses r ON r.id=sm.response_id WHERE rr.run_id=NEW.run_id AND rr.row_index=NEW.row_index;
    IF NEW.quote_text IS DISTINCT FROM original THEN
      RAISE EXCEPTION 'quote must equal original source text' USING ERRCODE='23514';
    END IF;
   END IF;
  END IF;
  RETURN NEW;
END $$
""", r"""
CREATE FUNCTION p5_check_run() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; r analysis_runs%ROWTYPE; expected integer; accepted integer; rejected integer;
        assembled jsonb; item record; indices jsonb; reps jsonb;
BEGIN
  IF TG_TABLE_NAME='analysis_runs' THEN rid := NEW.id; ELSE rid := NEW.run_id; END IF;
  SELECT * INTO r FROM analysis_runs WHERE id=rid;
  IF r.status <> 'COMPLETED' THEN
    IF EXISTS (SELECT 1 FROM run_responses WHERE run_id=rid) OR EXISTS (SELECT 1 FROM findings WHERE run_id=rid) THEN
      RAISE EXCEPTION 'partial result graph cannot commit without COMPLETED run' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END IF;
  SELECT member_count INTO expected FROM input_snapshots WHERE id=r.snapshot_id;
  SELECT count(*) FILTER (WHERE validation_status='ACCEPTED'), count(*) FILTER (WHERE validation_status='REJECTED')
    INTO accepted,rejected FROM run_responses WHERE run_id=rid;
  IF accepted=0 OR accepted+rejected <> expected OR (SELECT count(*) FROM sentiment_predictions WHERE run_id=rid) <> accepted
     OR r.result_json->>'schema_version' IS DISTINCT FROM '2.0'
     OR (r.result_json->>'total_received')::integer IS DISTINCT FROM expected
     OR (r.result_json->>'total_responses')::integer IS DISTINCT FROM accepted
     OR (r.result_json->>'rejected_count')::integer IS DISTINCT FROM rejected THEN
    RAISE EXCEPTION 'completed run has missing rows, predictions or invalid totals' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(jsonb_agg(normalized ORDER BY row_index),'[]'::jsonb) INTO assembled
    FROM run_responses WHERE run_id=rid AND validation_status='ACCEPTED';
  IF assembled IS DISTINCT FROM r.result_json->'responses' THEN
    RAISE EXCEPTION 'normalized rows differ from saved result' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM run_responses rr JOIN sentiment_predictions p USING(run_id,row_index)
             JOIN snapshot_members sm ON sm.snapshot_id=rr.snapshot_id AND sm.row_index=rr.row_index
             JOIN responses s ON s.id=sm.response_id WHERE rr.run_id=rid AND
             ((rr.normalized->>'row_index')::integer IS DISTINCT FROM rr.row_index OR
              rr.normalized->>'text' IS DISTINCT FROM s.original_text OR
              rr.normalized->>'sentiment' IS DISTINCT FROM p.sentiment OR
              (rr.normalized->>'confidence')::double precision IS DISTINCT FROM p.confidence OR
              (rr.normalized->>'input_length')::integer IS DISTINCT FROM p.input_length OR
              (rr.normalized->>'word_count')::integer IS DISTINCT FROM p.word_count)) THEN
    RAISE EXCEPTION 'prediction or original text differs from saved response' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('row_index',row_index,'message',rejection_message) ORDER BY row_index),'[]'::jsonb)
    INTO assembled FROM run_responses WHERE run_id=rid AND validation_status='REJECTED';
  IF assembled IS DISTINCT FROM r.result_json->'rejected' THEN
    RAISE EXCEPTION 'rejections differ from saved result' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(jsonb_agg(payload ORDER BY rank),'[]'::jsonb) INTO assembled FROM findings WHERE run_id=rid AND kind='issue';
  IF assembled IS DISTINCT FROM r.result_json->'issues' THEN
    RAISE EXCEPTION 'issues differ from saved result' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(jsonb_agg(payload ORDER BY rank),'[]'::jsonb) INTO assembled FROM findings WHERE run_id=rid AND kind='topic';
  IF assembled IS DISTINCT FROM r.result_json->'topics' THEN
    RAISE EXCEPTION 'topics differ from saved result' USING ERRCODE='23514';
  END IF;
  FOR item IN SELECT * FROM findings WHERE run_id=rid LOOP
    SELECT coalesce(jsonb_agg(row_index ORDER BY row_index),'[]'::jsonb) INTO indices FROM finding_evidence WHERE finding_id=item.id;
    IF indices IS DISTINCT FROM item.payload->'response_indices' THEN
      RAISE EXCEPTION 'finding lacks complete evidence membership' USING ERRCODE='23514';
    END IF;
    IF item.kind='issue' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('row_index',e.row_index,'id',rr.normalized->'id',
             'text',e.quote_text,'sentiment',p.sentiment,'confidence',p.confidence) ORDER BY representative_rank),'[]'::jsonb)
        INTO reps FROM finding_evidence e JOIN run_responses rr USING(run_id,row_index)
        JOIN sentiment_predictions p USING(run_id,row_index) WHERE e.finding_id=item.id AND representative_rank IS NOT NULL;
      IF reps IS DISTINCT FROM item.payload->'representative_feedback' THEN
        RAISE EXCEPTION 'representative evidence differs from source' USING ERRCODE='23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $$
"""]

TRIGGERS = []
for table in ('responses', 'snapshot_members', 'run_responses', 'sentiment_predictions', 'findings',
              'finding_evidence', 'operation_receipts', 'audit_logs'):
    TRIGGERS.append(f'CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION p5_immutable()')
for table in ('imports', 'input_snapshots'):
    TRIGGERS += [f'CREATE TRIGGER seal_only BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION p5_seal_only()',
                 f'CREATE CONSTRAINT TRIGGER check_sealed AFTER INSERT OR UPDATE ON {table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION p5_check_sealed()']
for table in ('imports', 'input_snapshots', 'responses', 'snapshot_members'):
    TRIGGERS.append(f'CREATE TRIGGER input_insert BEFORE INSERT ON {table} FOR EACH ROW EXECUTE FUNCTION p5_input_insert()')
TRIGGERS.append('CREATE TRIGGER run_guard BEFORE INSERT OR UPDATE OR DELETE ON analysis_runs FOR EACH ROW EXECUTE FUNCTION p5_run_guard()')
for table in ('run_responses', 'sentiment_predictions', 'findings', 'finding_evidence'):
    TRIGGERS.append(f'CREATE TRIGGER result_insert BEFORE INSERT ON {table} FOR EACH ROW EXECUTE FUNCTION p5_result_insert()')
for table in ('analysis_runs', 'run_responses', 'sentiment_predictions', 'findings', 'finding_evidence'):
    TRIGGERS.append(f'CREATE CONSTRAINT TRIGGER check_run AFTER INSERT OR UPDATE ON {table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION p5_check_run()')

FUNCTION_NAMES = ('p5_check_run','p5_result_insert','p5_run_guard','p5_check_sealed','p5_input_insert','p5_seal_only','p5_immutable')
