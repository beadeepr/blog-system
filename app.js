const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const session = require('express-session');
const marked = require('marked');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

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

function isAdmin(req) {
  return !!(req.session && req.session.isAdmin);
}

// ==================== 前台 ====================

// 首页：搜索 + 分类 + 分页（只显示已审核文章）
app.get('/', (req, res) => {
  const keyword = req.query.keyword ? req.query.keyword.trim() : '';
  const category = req.query.category ? req.query.category.trim() : '';
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = 5;
  const offset = (page - 1) * pageSize;

  let whereSql = `WHERE status = 'approved'`;
  const params = [];

  if (keyword) {
    whereSql += ' AND (title LIKE ? OR summary LIKE ? OR content LIKE ? OR tags LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (category) {
    whereSql += ' AND category = ?';
    params.push(category);
  }

  const countSql = `SELECT COUNT(*) as total FROM articles ${whereSql}`;
  const total = db.prepare(countSql).get(...params).total;

  const listSql = `
    SELECT * FROM articles
    ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;
  const articles = db.prepare(listSql).all(...params, pageSize, offset);

  const categories = db.prepare(`
    SELECT DISTINCT category FROM articles
    WHERE status = 'approved' AND category IS NOT NULL AND category != ''
  `).all();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  res.render('index', {
    articles,
    keyword,
    category,
    categories,
    page,
    totalPages,
    isAdmin: isAdmin(req)
  });
});

// 游客投稿页
app.get('/submit', (req, res) => {
  res.render('submit');
});

// 游客提交文章，默认待审核
app.post('/submit', (req, res) => {
  const {
    title = '',
    content = '',
    summary = '',
    category = '',
    tags = '',
    submitter_name = ''
  } = req.body;

  if (!title.trim() || !content.trim() || !summary.trim() || !category.trim()) {
    return res.send('标题、内容、摘要、分类不能为空');
  }

  db.prepare(`
    INSERT INTO articles (
      title, content, summary, category, tags, view_count, status, submitter_name, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)
  `).run(
    title.trim(),
    content.trim(),
    summary.trim(),
    category.trim(),
    tags.trim(),
    0,
    submitter_name.trim() || '匿名投稿'
  );

  res.send(`
    <script>
      alert('文章投稿成功，审核通过后将显示');
      window.location.href = '/';
    </script>
  `);
});

// 文章详情
app.get('/article/:id', (req, res) => {
  const id = req.params.id;
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);

  if (!article) {
    return res.status(404).send('文章不存在');
  }

  if (article.status !== 'approved' && !isAdmin(req)) {
    return res.status(404).send('文章不存在或尚未通过审核');
  }

  db.prepare('UPDATE articles SET view_count = view_count + 1 WHERE id = ?').run(id);

  const updatedArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
  updatedArticle.content = marked.parse(updatedArticle.content);

  const comments = db.prepare(`
    SELECT * FROM comments
    WHERE article_id = ? AND status = 'approved'
    ORDER BY id DESC
  `).all(id);

  res.render('detail', {
    article: updatedArticle,
    comments,
    isAdmin: isAdmin(req)
  });
});

// 访客提交评论
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

// ==================== 登录 ====================

app.get('/login', (req, res) => {
  res.render('login', { error: '' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

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

// ==================== 后台 ====================

// 后台首页
app.get('/admin', requireAdmin, (req, res) => {
  const articleCount = db.prepare('SELECT COUNT(*) AS count FROM articles').get().count;
  const commentCount = db.prepare('SELECT COUNT(*) AS count FROM comments').get().count;
  const pendingCount = db.prepare(`
    SELECT COUNT(*) AS count FROM comments WHERE status = 'pending'
  `).get().count;
  const pendingArticleCount = db.prepare(`
    SELECT COUNT(*) AS count FROM articles WHERE status = 'pending'
  `).get().count;

  res.render('admin', {
    articleCount,
    commentCount,
    pendingCount,
    pendingArticleCount,
    adminName: req.session.adminName
  });
});

// 文章管理页
app.get('/admin/articles', requireAdmin, (req, res) => {
  const articles = db.prepare(`
    SELECT * FROM articles ORDER BY id DESC
  `).all();

  res.render('admin-articles', {
    articles,
    adminName: req.session.adminName
  });
});

// 评论审核页
app.get('/admin/comments', requireAdmin, (req, res) => {
  const comments = db.prepare(`
    SELECT comments.*, articles.title AS article_title
    FROM comments
    LEFT JOIN articles ON comments.article_id = articles.id
    ORDER BY comments.id DESC
  `).all();

  res.render('admin-comments', {
    comments,
    adminName: req.session.adminName
  });
});

// 发布文章页（管理员直发）
app.get('/create', requireAdmin, (req, res) => {
  res.render('create');
});

// 提交文章（管理员直发，直接 approved）
app.post('/create', requireAdmin, (req, res) => {
  const { title, content, summary, category, tags } = req.body;

  if (!title || !content || !summary || !category) {
    return res.send('标题、内容、摘要、分类不能为空');
  }

  db.prepare(`
    INSERT INTO articles (
      title, content, summary, category, tags, view_count, status, submitter_name, created_at, reviewed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(title, content, summary, category, tags || '', 0, req.session.adminName || '管理员');

  res.redirect('/admin/articles');
});

// 编辑文章页
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

  res.redirect('/admin/articles');
});

// 删除文章
app.post('/delete/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  db.prepare('DELETE FROM articles WHERE id = ?').run(id);

  res.redirect('/admin/articles');
});

// 审核通过文章
app.post('/admin/articles/approve/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  db.prepare(`
    UPDATE articles
    SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  res.redirect('/admin/articles');
});

// 拒绝文章
app.post('/admin/articles/reject/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  db.prepare(`
    UPDATE articles
    SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  res.redirect('/admin/articles');
});

// 审核通过评论
app.post('/admin/comments/approve/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  db.prepare(`
    UPDATE comments
    SET status = 'approved'
    WHERE id = ?
  `).run(id);

  res.redirect('/admin/comments');
});

// 拒绝评论
app.post('/admin/comments/reject/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  db.prepare(`
    UPDATE comments
    SET status = 'rejected'
    WHERE id = ?
  `).run(id);

  res.redirect('/admin/comments');
});

// 删除评论
app.post('/admin/comments/delete/:id', requireAdmin, (req, res) => {
  const id = req.params.id;

  db.prepare(`
    DELETE FROM comments
    WHERE id = ?
  `).run(id);

  res.redirect('/admin/comments');
});

app.listen(PORT, () => {
  console.log(`服务器运行在: http://localhost:${PORT}`);
});
