const bookshelf = require('../db/bookshelf');

const Post = require('./post');
const User = require('./user');

const Comment = bookshelf.Model.extend({
  tableName: 'comments',
  hasTimestamps: true,
  user: function() {
    return this.belongsTo('User');
  },
  post: function() {
    return this.belongsTo('Post');
  },
});

module.exports = bookshelf.model('Comment', Comment);
