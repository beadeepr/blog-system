const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../blog.db'));

// ==================== 文章表 ====================
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    summary TEXT,
    view_count INTEGER DEFAULT 0
  )
`);

let articleColumns = db.prepare(`PRAGMA table_info(articles)`).all();
let articleColumnNames = articleColumns.map(col => col.name);

if (!articleColumnNames.includes('category')) {
  db.prepare(`ALTER TABLE articles ADD COLUMN category TEXT`).run();
}

if (!articleColumnNames.includes('tags')) {
  db.prepare(`ALTER TABLE articles ADD COLUMN tags TEXT`).run();
}

if (!articleColumnNames.includes('status')) {
  db.prepare(`ALTER TABLE articles ADD COLUMN status TEXT`).run();
  db.prepare(`UPDATE articles SET status = 'approved' WHERE status IS NULL`).run();
}

if (!articleColumnNames.includes('submitter_name')) {
  db.prepare(`ALTER TABLE articles ADD COLUMN submitter_name TEXT`).run();
  db.prepare(`UPDATE articles SET submitter_name = '管理员' WHERE submitter_name IS NULL`).run();
}

if (!articleColumnNames.includes('created_at')) {
  db.prepare(`ALTER TABLE articles ADD COLUMN created_at TEXT`).run();
  db.prepare(`UPDATE articles SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL`).run();
}

if (!articleColumnNames.includes('reviewed_at')) {
  db.prepare(`ALTER TABLE articles ADD COLUMN reviewed_at TEXT`).run();
  db.prepare(`
    UPDATE articles
    SET reviewed_at = CURRENT_TIMESTAMP
    WHERE reviewed_at IS NULL AND status = 'approved'
  `).run();
}

// ==================== 评论表 ====================
db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER,
    author TEXT,
    content TEXT
  )
`);

let commentColumns = db.prepare(`PRAGMA table_info(comments)`).all();
let commentColumnNames = commentColumns.map(col => col.name);

if (!commentColumnNames.includes('status')) {
  db.prepare(`ALTER TABLE comments ADD COLUMN status TEXT DEFAULT 'pending'`).run();
}

if (!commentColumnNames.includes('created_at')) {
  db.prepare(`ALTER TABLE comments ADD COLUMN created_at TEXT`).run();
  db.prepare(`UPDATE comments SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL`).run();
}

// ==================== 初始文章 ====================
const count = db.prepare('SELECT COUNT(*) AS count FROM articles').get();

if (count.count === 0) {
  db.prepare(`
    INSERT INTO articles
    (title, content, summary, category, tags, view_count, status, submitter_name, created_at, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    '第一篇真实博客',
    '# 欢迎\\n这是第一篇文章内容',
    '摘要1',
    '技术',
    'Node.js,Express',
    10,
    'approved',
    '管理员'
  );

  db.prepare(`
    INSERT INTO articles
    (title, content, summary, category, tags, view_count, status, submitter_name, created_at, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    '第二篇真实博客',
    '## Markdown 示例\\n- 列表1\\n- 列表2',
    '摘要2',
    '学习',
    'Markdown,SQLite',
    5,
    'approved',
    '管理员'
  );
}

module.exports = db;