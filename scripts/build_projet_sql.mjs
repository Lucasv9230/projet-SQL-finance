import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const header = `-- =====================================================================
-- PROJET SQL AVANCÉ - PLATEFORME DE COURTAGE & MARCHÉS FINANCIERS
-- Matière : SQL avancé · Ycode A2627_4728 · Bachelor 2 (2026-2027)
-- Formateur : Luc Charlopeau
--
-- Ordre d'exécution :
-- 1. Tables et contraintes d'intégrité
-- 2. Jeu de données volumineux (20 000 transactions, 500 clients, 20 titres)
-- 3. Procédure stockée d'exécution d'ordre (executer_ordre)
-- 4. Trigger d'intégrité et de mise à jour automatique des portefeuilles
-- 5. Vues d'abstraction par profil métier
-- 6. Rôles et privilèges DCL (principe du moindre privilège)
-- 7. Index de performance
-- =====================================================================

-- Compatibilité environnement standard Postgres / Supabase
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
`;

const schema = fs.readFileSync(path.join(rootDir, 'sql/01_schema.sql'), 'utf-8');
const donnees = fs.readFileSync(path.join(rootDir, 'sql/02_donnees.sql'), 'utf-8');
const procTrigger = fs.readFileSync(path.join(rootDir, 'sql/03_procedure_trigger.sql'), 'utf-8');
const vuesRolesIndex = fs.readFileSync(path.join(rootDir, 'sql/05_vues_roles_index.sql'), 'utf-8');

const fullSql = [
  header,
  '\n-- =====================================================================',
  '-- 1. TABLES ET RELATIONS',
  '-- =====================================================================\n',
  schema,
  '\n-- =====================================================================',
  '-- 2. JEU DE DONNÉES DE DÉMONSTRATION (> 10 000 LIGNES)',
  '-- =====================================================================\n',
  donnees,
  '\n-- =====================================================================',
  '-- 3. PROCÉDURE STOCKÉE ET 4. TRIGGER MÉTIER',
  '-- =====================================================================\n',
  procTrigger,
  '\n-- =====================================================================',
  '-- 5. VUES, 6. RÔLES ET 7. INDEX DE PERFORMANCE',
  '-- =====================================================================\n',
  vuesRolesIndex
].join('\n');

fs.writeFileSync(path.join(rootDir, 'projet.sql'), fullSql, 'utf-8');
console.log('projet.sql généré avec succès à la racine du projet.');
