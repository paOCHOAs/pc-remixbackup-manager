ALTER TABLE tracks ADD COLUMN file_format TEXT;

UPDATE tracks SET file_format = lower(substr(filename, instr(filename, '.') + 1))
WHERE file_format IS NULL;
