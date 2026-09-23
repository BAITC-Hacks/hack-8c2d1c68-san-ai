-- Reassign only original demo rows, without overwriting unrelated user edits.
UPDATE org_nodes SET parent_id='company', department_id=NULL, role='Генеральный директор'
WHERE dataset='demo-v1' AND id='emp-00002' AND parent_id='emp-00001' AND role='Аналитик';
UPDATE org_nodes SET parent_id=department_id, role='Директор департамента'
WHERE dataset='demo-v1' AND (
  (id='emp-00003' AND parent_id='emp-00001' AND role='Специалист') OR
  (id IN (SELECT 'emp-' || lpad((d*1000+2)::text,5,'0') FROM generate_series(1,19) d)
    AND parent_id='emp-' || lpad((substring(id from 5)::int-1)::text,5,'0') AND role='Аналитик')
);
