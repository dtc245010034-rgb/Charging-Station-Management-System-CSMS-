const users = require('./users.repository');

const listRoles = () => users.listRoles();

module.exports = { listRoles };
