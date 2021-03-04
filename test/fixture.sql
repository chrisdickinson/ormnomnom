CREATE TABLE invoices (
  id serial primary key,
  name varchar(255),
  date timestamp
);

INSERT INTO invoices (name, date) VALUES
    ('a thing', to_timestamp('1/1/2012', 'MM/DD/YYYY') AT TIME ZONE 'UTC'),
    ('another thing', to_timestamp('10/19/2013', 'MM/DD/YYYY') AT TIME ZONE 'UTC'),
    ('great', to_timestamp('11/20/2016', 'MM/DD/YYYY') AT TIME ZONE 'UTC');

CREATE TABLE line_items (
  id serial primary key,
  subtotal real,
  discount real,
  invoice_id integer default null references "invoices" ("id") on delete cascade
);

WITH invoice AS (
  SELECT id FROM invoices WHERE name = 'a thing'
)
INSERT INTO line_items (subtotal, discount, invoice_id) VALUES
    (10, 0, (SELECT id FROM invoice)),
    (20, 1, (SELECT id FROM invoice)),
    (30, 2, (SELECT id FROM invoice)),
    (40, 3, (SELECT id FROM invoice)),
    (50, 4, (SELECT id FROM invoice)),
    (60, 5, (SELECT id FROM invoice)),
    (70, 6, (SELECT id FROM invoice)),
    (80, 7, (SELECT id FROM invoice)),
    (90, 8, (SELECT id FROM invoice)),
    (100, 9, (SELECT id FROM invoice));

WITH invoice AS (
  SELECT id FROM invoices WHERE name = 'another thing'
)
INSERT INTO line_items (subtotal, discount, invoice_id) VALUES
    (10, 0, (SELECT id FROM invoice)),
    (20, 1, (SELECT id FROM invoice)),
    (30, 2, (SELECT id FROM invoice)),
    (40, 3, (SELECT id FROM invoice)),
    (50, 4, (SELECT id FROM invoice)),
    (60, 5, (SELECT id FROM invoice)),
    (70, 6, (SELECT id FROM invoice)),
    (80, 7, (SELECT id FROM invoice)),
    (90, 8, (SELECT id FROM invoice)),
    (100, 9, (SELECT id FROM invoice));

WITH invoice AS (
  SELECT id FROM invoices WHERE name = 'great'
)
INSERT INTO line_items (subtotal, discount, invoice_id) VALUES
    (10, 0, (SELECT id FROM invoice)),
    (20, 1, (SELECT id FROM invoice)),
    (30, 2, (SELECT id FROM invoice)),
    (40, 3, (SELECT id FROM invoice)),
    (50, 4, (SELECT id FROM invoice)),
    (60, 5, (SELECT id FROM invoice)),
    (70, 6, (SELECT id FROM invoice)),
    (80, 7, (SELECT id FROM invoice)),
    (90, 8, (SELECT id FROM invoice)),
    (100, 9, (SELECT id FROM invoice));

CREATE TABLE nodes (
  id serial primary key,
  name varchar(255),
  val real
);

INSERT INTO nodes (name, val) VALUES
    ('HELLO', 3),
    ('Gary busey', -10),
    ('John Bonham', 10000),
    ('Mona Lisa', 100),
    (NULL, 10);

CREATE TABLE refs (
  id serial primary key,
  node_id integer not null references "nodes" ("id") on delete cascade,
  val real
);

INSERT INTO refs (node_id, val) VALUES
    ((SELECT id FROM nodes WHERE name = 'HELLO'), 10),
    ((SELECT id FROM nodes WHERE name = 'Gary busey'), 0),
    ((SELECT id FROM nodes WHERE name = 'John Bonham'), 0);

CREATE TABLE farouts (
  id serial primary key,
  ref_id integer default null references "refs" ("id") on delete cascade,
  second_ref_id integer default null references "refs" ("id") on delete cascade
);

CREATE TABLE items (
  id serial primary key,
  name text,
  structured_content jsonb DEFAULT NULL,
  created timestamp,
  updated timestamp,
  deleted timestamp
);

CREATE TABLE item_details (
  id serial primary key,
  comment text,
  item_id integer default null references "items" ("id") on delete cascade,
  deleted_at timestamp
);

CREATE TABLE item_prices (
  id serial primary key,
  price integer,
  item_detail_id integer default null references "item_details" ("id") on delete cascade
);

CREATE TABLE column_tests (
  id serial primary key,
  b64_json_column text
);

CREATE TABLE ref_column_tests (
  id serial primary key,
  column_id integer default null references "column_tests" ("id") on delete cascade
);

CREATE TABLE encrypted_column_tests (
  id serial primary key,
  secret_data text
);
