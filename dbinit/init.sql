-- MySQL Initialization Script for Jokes Database
CREATE DATABASE IF NOT EXISTS jokes_db;
USE jokes_db;

DROP TABLE IF EXISTS jokes;
DROP TABLE IF EXISTS types;

CREATE TABLE types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(50) UNIQUE NOT NULL,
    INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE jokes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setup TEXT NOT NULL,
    punchline TEXT NOT NULL,
    type_id INT NOT NULL,
    FOREIGN KEY (type_id) REFERENCES types(id) ON DELETE CASCADE,
    INDEX idx_type_id (type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO types (type) VALUES 
('general'),
('knock-knock'),
('programming');

INSERT INTO jokes (setup, punchline, type_id) VALUES
('What did the fish say when it hit the wall?', 'Dam.', 1),
('How do you make a tissue dance?', 'You put a little boogie on it.', 1),
('Why can''t bicycles stand on their own?', 'They are two tired', 1),
('What do you call a singing Laptop', 'A Dell', 1),
('How do you organize an outer space party?', 'You planet', 1),
('What''s the best time to go to the dentist?', 'Tooth hurty.', 1),
('Knock knock. Who''s there? A broken pencil. A broken pencil who?', 'Never mind. It''s pointless.', 2),
('Knock knock. Who''s there? Cows go. Cows go who?', 'No, cows go moo.', 2),
('Knock knock. Who''s there? Little old lady. Little old lady who?', 'I didn''t know you could yodel!', 2),
('What''s the best thing about a Boolean?', 'Even if you''re wrong, you''re only off by a bit.', 3),
('What''s the object-oriented way to become wealthy?', 'Inheritance', 3),
('Where do programmers like to hangout?', 'The Foo Bar.', 3),
('Why did the programmer quit his job?', 'Because he didn''t get arrays.', 3),
('Why do programmers always mix up Halloween and Christmas?', 'Because Oct 31 == Dec 25', 3),
('A SQL query walks into a bar, walks up to two tables and asks...', 'Can I join you?', 3),
('How many programmers does it take to change a lightbulb?', 'None that''s a hardware problem', 3),
('To understand what recursion is...', 'You must first understand what recursion is', 3),
('There are 10 types of people in this world...', 'Those who understand binary and those who don''t', 3),
('Why do Java programmers wear glasses?', 'Because they don''t C#', 3),
('What do you call a cow with no legs?', 'Ground beef!', 1),
('What do you call sad coffee?', 'Despresso.', 1),
('Why did the butcher work extra hours at the shop?', 'To make ends meat.', 1);
