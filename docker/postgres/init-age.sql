-- Civic Influence Graph — Apache AGE Graph Initialization
-- Run AFTER init.sql; requires AGE extension already loaded

-- Load AGE into session
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

-- Create the influence graph
SELECT create_graph('influence');

-- Create vertex labels (node types)
SELECT create_vlabel('influence', 'Person');
SELECT create_vlabel('influence', 'Committee');
SELECT create_vlabel('influence', 'Organization');
SELECT create_vlabel('influence', 'Bill');
SELECT create_vlabel('influence', 'Sector');

-- Create edge labels (relationship types)
SELECT create_elabel('influence', 'DONATED_TO');
SELECT create_elabel('influence', 'LOBBIED_FOR');
SELECT create_elabel('influence', 'LOBBIED_BY');
SELECT create_elabel('influence', 'VOTED_ON');
SELECT create_elabel('influence', 'SPONSORED');
SELECT create_elabel('influence', 'AFFILIATED_WITH');
SELECT create_elabel('influence', 'IN_SECTOR');
SELECT create_elabel('influence', 'PARENT_OF');
