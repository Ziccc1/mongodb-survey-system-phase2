// P2 application role. Cluster diagnostics require the role to be defined in admin.
// Actual app_v2 authentication enforcement evidence: docs/testing/phase2-runs/delivery-20261025/.
// Use a separate administrator, after reviewing diagnostics and migration identities.
if(!/^project2_(app_v2|test_[A-Za-z0-9_]+)$/.test(db.getName()))throw Error('Explicit P2 phase2 application target required');
const insertOnly=['users','question_versions','survey_versions','responses','operation_receipts'];
const mutable=['surveys','question_items','question_banks','question_grants','survey_templates','template_grants'];
const relations=['question_bank_members','survey_question_bindings'];
const role={role:'project2_application',privileges:[
 {resource:{db:db.getName(),collection:''},actions:['listCollections']},
 ...insertOnly.map(collection=>({resource:{db:db.getName(),collection},actions:['listIndexes','find','insert']})),
 ...mutable.map(collection=>({resource:{db:db.getName(),collection},actions:['listIndexes','find','insert','update']})),
 ...relations.map(collection=>({resource:{db:db.getName(),collection},actions:['listIndexes','find','insert','update','remove']})),
 // The existing local instance-identity gate needs these diagnostic commands on the cluster.
 {resource:{cluster:true},actions:['getCmdLineOpts','serverStatus','replSetGetConfig']},
],roles:[]};
const roleDatabase=db.getSiblingDB('admin');
if(roleDatabase.getRole(role.role))throw Error('Role already exists: inspect instead of overwriting');
roleDatabase.createRole(role);
print('P2 role provisioned in admin; assign this role with db admin to an application user. Running this script alone does not enable authentication. Binding publication rows remain insert/read-only at the application layer because roles cannot distinguish scope within a collection. Migration DDL requires another identity.');
