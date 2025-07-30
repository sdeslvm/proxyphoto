const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// Папка для кэша
const CACHE_DIR = path.join(__dirname, 'cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

// Middleware для логов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Главный эндпоинт: /fetch?url=...
app.get('/fetch', async (req, res) => {
  const imageUrl = req.query.url;

  if (!imageUrl) {
    return res.status(400).send('Missing "url" parameter');
  }

  try {
    // Безопасное имя файла (хэш от URL)
    const hash = require('crypto').createHash('md5').update(imageUrl).digest('hex');
    const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
    const filePath = path.join(CACHE_DIR, hash + ext);

    // 1. Проверяем кэш
    if (fs.existsSync(filePath)) {
      console.log('Cache hit:', filePath);
      return res.sendFile(filePath);
    }

    // 2. Если нет в кэше — скачиваем
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.dekomo.ru/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      timeout: 10000,
    });

    // Проверяем, что это действительно изображение
    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.startsWith('image/')) {
      return res.status(400).send('URL does not point to an image');
    }

    // Сохраняем в кэш
    fs.writeFileSync(filePath, response.data);
    console.log('Cached:', filePath);

    // Отдаём клиенту
    res.set('Content-Type', contentType);
    res.send(response.data);

  } catch (error) {
    console.error('Fetch error:', error.message);
    return res.status(500).send('Failed to fetch image');
  }
});

// Опционально: очистка кэша (раз в день)
setInterval(() => {
  fs.readdir(CACHE_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(CACHE_DIR, file);
      fs.stat(filePath, (err, stat) => {
        if (err) return;
        // Удаляем файлы старше 7 дней
        if (now - stat.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
          fs.unlink(filePath, () => console.log('Cleaned:', file));
        }
      });
    });
  });
}, 24 * 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`Image proxy running on port ${port}`);
});
