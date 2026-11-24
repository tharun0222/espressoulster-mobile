ALTER TABLE profiles ADD COLUMN gender TEXT NOT NULL DEFAULT '' CHECK (gender IN ('', 'male', 'female', 'nonbinary', 'undisclosed'));
