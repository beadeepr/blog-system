const marked = require('marked');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const db = require('./db/database');
const session = require('express-session');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(session({
  secret: 'blog_admin_secret_2026',
  resave: false,
  saveUninitialized: false
}));

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.redirect('/login');
}

app.get('/login', (req, res) => {
  res.render('login', { error: '' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // 这里先写死一个管理员账号，适合作业
  const adminUsername = 'admin';
  const adminPassword = '123456';

  if (username === adminUsername && password === adminPassword) {
    req.session.isAdmin = true;
    req.session.adminName = username;
    return res.redirect('/admin');
  }

  res.render('login', { error: '用户名或密码错误' });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// 首页：文章列表
app.get('/', (req, res) => {
const keyword = req.query.keyword ? req.query.keyword.trim() : '';
const category = req.query.category ? req.query.category.trim() : '';
  const page = parseInt(req.query.page) || 1;
  const pageSize = 5;
  const offset = (page - 1) * pageSize;

  let whereSql = 'WHERE 1=1';
  const params = [];

  if (keyword) {
    whereSql += ' AND (title LIKE ? OR summary LIKE ? OR content LIKE ? OR tags LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (category) {
    whereSql += ' AND category = ?';
    params.push(category);
  }

  // 查询总条数
  const countSql = `SELECT COUNT(*) as total FROM articles ${whereSql}`;
  const total = db.prepare(countSql).get(...params).total;

  // 查询当前页数据
  const listSql = `
    SELECT * FROM articles
    ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;
  const articles = db.prepare(listSql).all(...params, pageSize, offset);

  const categories = db.prepare(`
    SELECT DISTINCT category FROM articles
    WHERE category IS NOT NULL AND category != ''
  `).all();

  const totalPages = Math.ceil(total / pageSize);

  res.render('index', {
    articles,
    keyword,
    category,
    categories,
    page,
    totalPages
  });
});
// 文章详情页
app.get('/article/:id', (req, res) => {
  const id = req.params.id;

  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);

  if (!article) {
    return res.status(404).send('文章不存在');
  }

  db.prepare('UPDATE articles SET view_count = view_count + 1 WHERE id = ?').run(id);

  const updatedArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
  updatedArticle.content = marked.parse(updatedArticle.content);

  const comments = db.prepare(`
    SELECT * FROM comments
    WHERE article_id = ? AND status = 'approved'
    ORDER BY id DESC
  `).all(id);

  res.render('detail', { article: updatedArticle, comments });
});
// 发布文章页面
app.get('/create', requireAdmin, (req, res) => {
  res.render('create');
});

// 提交新文章
app.post('/create', requireAdmin, (req, res) => {
  const { title, content, summary, category, tags } = req.body;

  if (!title || !content || !summary || !category) {
    return res.send('标题、内容、摘要、分类不能为空');
  }

  db.prepare(`
    INSERT INTO articles (title, content, summary, category, tags, view_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, content, summary, category, tags || '', 0);

  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`服务器运行在：http://localhost:${PORT}`);
});
// 编辑页面
app.get('/edit/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);

  if (!article) {
    return res.send('文章不存在');
  }

  res.render('edit', { article });
});
// 提交编辑
app.post('/edit/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const { title, content, summary, category, tags } = req.body;

  db.prepare(`
    UPDATE articles
    SET title = ?, content = ?, summary = ?, category = ?, tags = ?
    WHERE id = ?
  `).run(title, content, summary, category, tags || '', id);

  res.redirect('/article/' + id);
});
// 删除文章
app.post('/delete/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  db.prepare('DELETE FROM articles WHERE id = ?').run(id);

  res.redirect('/');
});

app.post('/article/:id/comment', (req, res) => {
  const articleId = req.params.id;
  const { author, content } = req.body;

  if (!author || !content) {
    return res.send('评论人和评论内容不能为空');
  }

  db.prepare(`
    INSERT INTO comments (article_id, author, content)
    VALUES (?, ?, ?)
  `).run(articleId, author, content);

  res.redirect('/article/' + articleId);
});

app.post('/article/:id/comment', (req, res) => {
  const articleId = req.params.id;
  const { author, content } = req.body;

  if (!author || !content) {
    return res.send('评论人和评论内容不能为空');
  }

  db.prepare(`
    INSERT INTO comments (article_id, author, content, status)
    VALUES (?, ?, ?, 'pending')
  `).run(articleId, author, content);

  res.send(`
    <script>
      alert('评论已提交，审核通过后将显示');
      window.location.href = '/article/${articleId}';
    </script>
  `);
});

app.get('/admin/comments', requireAdmin, (req, res) => {
  const comments = db.prepare(`
    SELECT comments.*, articles.title AS article_title
    FROM comments
    LEFT JOIN articles ON comments.article_id = articles.id
    ORDER BY comments.id DESC
  `).all();

  res.render('admin-comments', { comments });
});

app.post('/admin/comments/approve/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  db.prepare(`
    UPDATE comments
    SET status = 'approved'
    WHERE id = ?
  `).run(id);

  res.redirect('/admin/comments');
});

app.post('/admin/comments/reject/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  db.prepare(`
    UPDATE comments
    SET status = 'rejected'
    WHERE id = ?
  `).run(id);

  res.redirect('/admin/comments');
});

app.post('/admin/comments/delete/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  db.prepare(`
    DELETE FROM comments
    WHERE id = ?
  `).run(id);

  res.redirect('/admin/comments');
});

app.get('/admin', requireAdmin, (req, res) => {
  const articleCount = db.prepare('SELECT COUNT(*) AS count FROM articles').get().count;
  const commentCount = db.prepare('SELECT COUNT(*) AS count FROM comments').get().count;
  const pendingCount = db.prepare(`
    SELECT COUNT(*) AS count FROM comments WHERE status = 'pending'
  `).get().count;

  res.render('admin', {
    articleCount,
    commentCount,
    pendingCount
  });
});

app.get('/admin/articles', requireAdmin, (req, res) => {
  const articles = db.prepare(`
    SELECT * FROM articles ORDER BY id DESC
  `).all();

  res.render('admin-articles', { articles });
});