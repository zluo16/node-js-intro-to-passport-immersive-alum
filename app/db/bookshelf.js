const config  = require('../../knexfile.js');
const knex = require('knex')(config['development']);
const bookshelf = require('bookshelf')(knex);

bookshelf.plugin('registry');

module.exports = bookshelf;
