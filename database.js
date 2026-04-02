const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../blog.db'));

// articles 表
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    summary TEXT,
    view_count INTEGER DEFAULT 0
  )
`);

// 自动补列
const articleColumns = db.prepare(`PRAGMA table_info(articles)`).all();
const articleColumnNames = articleColumns.map(col => col.name);

if (!articleColumnNames.includes('category')) {
  db.prepare(`ALTER TABLE articles ADD COLUMN category TEXT`).run();
}

if (!articleColumnNames.includes('tags')) {
  db.prepare(`ALTER TABLE articles ADD COLUMN tags TEXT`).run();
}

// comments 表
db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER,
    author TEXT,
    content TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// 自动补 status / created_at
const commentColumns = db.prepare(`PRAGMA table_info(comments)`).all();
const commentColumnNames = commentColumns.map(col => col.name);

if (!commentColumnNames.includes('status')) {
  db.prepare(`ALTER TABLE comments ADD COLUMN status TEXT DEFAULT 'pending'`).run();
}

if (!commentColumnNames.includes('created_at')) {
  db.prepare(`ALTER TABLE comments ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP`).run();
}

// 4. 如果文章表为空，再插入初始数据
const count = db.prepare('SELECT COUNT(*) AS count FROM articles').get();

if (count.count === 0) {
  db.prepare(`
    INSERT INTO articles (title, content, summary, category, tags, view_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    '第一篇真实博客',
    '# 欢迎\n这是第一篇文章内容',
    '摘要1',
    '技术',
    'Node.js,Express',
    10
  );

  db.prepare(`
    INSERT INTO articles (title, content, summary, category, tags, view_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    '第二篇真实博客',
    '## Markdown 示例\n- 列表1\n- 列表2',
    '摘要2',
    '学习',
    'Markdown,SQLite',
    5
  );
}

module.exports = db;