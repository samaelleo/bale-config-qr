# ربات بله: تبدیل کانفیگ وایرگارد و متن به QR

- فایل `.conf` وایرگارد بفرستی → QR مخصوص اسکن با اپ WireGuard
- هر لینک یا متنی (vless://، vmess://، ss://، آدرس سایت، متن فارسی…) → QR

ربات با long polling کار می‌کنه، پس دامنه، SSL یا وبهوک لازم نداره. فقط سرور باید به `tapi.bale.ai` دسترسی داشته باشه.

## نصب روی سرور (یک خط)

توکن ربات رو از `@BotFather` در بله بگیر و روی سرور لینوکس (Ubuntu/Debian/CentOS) بزن:

```bash
curl -fsSL https://raw.githubusercontent.com/samaelleo/bale-config-qr/main/install.sh | sudo bash -s -- YOUR_BOT_TOKEN
```

این دستور کد رو در `/opt/bale-config-qr` نصب می‌کنه، virtualenv می‌سازه، توکن رو در `/etc/bale-config-qr.env` ذخیره می‌کنه و سرویس systemd به اسم `bale-config-qr` رو فعال و اجرا می‌کنه (بعد از ریبوت هم خودش بالا میاد).

## آپدیت

همون دستور بدون توکن (توکن قبلی حفظ می‌شه):

```bash
curl -fsSL https://raw.githubusercontent.com/samaelleo/bale-config-qr/main/install.sh | sudo bash
```

## مدیریت سرویس

```bash
sudo systemctl status bale-config-qr
```

```bash
sudo journalctl -u bale-config-qr -f
```

```bash
sudo systemctl restart bale-config-qr
```

تغییر توکن: فایل `/etc/bale-config-qr.env` رو ویرایش کن و سرویس رو ری‌استارت کن.

## اجرای دستی (بدون systemd)

```bash
pip install -r requirements.txt
BOT_TOKEN=YOUR_BOT_TOKEN python3 bot.py
```

تست ساخت QR: `python3 test_qr.py` (عکس‌ها در `test_out/`).

## محدودیت

حداکثر ظرفیت یک QR حدود ۲۹۰۰ بایته؛ کانفیگ‌های معمول وایرگارد (۲۰۰ تا ۵۰۰ بایت) راحت جا می‌شن.

## نسخه Cloudflare Worker

نسخه جاوااسکریپت همین ربات برای Cloudflare Workers در پوشه [`worker/`](worker/) هست (`npm install` و `npx wrangler deploy` داخل همون پوشه).
