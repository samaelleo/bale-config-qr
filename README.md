# ربات بله: تبدیل کانفیگ وایرگارد و متن به QR

- فایل `.conf` وایرگارد بفرستی → QR مخصوص اسکن با اپ WireGuard
- هر لینک یا متنی (vless://، vmess://، ss://، آدرس سایت، متن فارسی…) → QR

ربات دو حالت داره:
- **Long polling** (پیش‌فرض): دامنه و SSL لازم نداره، فقط سرور باید به `tapi.bale.ai` دسترسی داشته باشه.
- **Webhook**: یک آدرس عمومی HTTPS لازم داره (مثلاً پشت nginx یا Caddy).

## نصب روی سرور (یک خط)

روی سرور لینوکس (Ubuntu/Debian/CentOS) بزن:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/samaelleo/bale-config-qr/main/install.sh)"
```

نصب‌کننده (به انگلیسی) این‌ها رو ازت می‌پرسه:
1. توکن ربات (از `@BotFather` در بله)
2. حالت دریافت پیام: `1` برای long polling یا `2` برای webhook
3. اگه webhook رو انتخاب کنی: آدرس عمومی HTTPS، سکرت وبهوک (خالی بذاری تصادفی ساخته می‌شه) و پورت محلی (پیش‌فرض `8080`)

بعد کد رو در `/opt/bale-config-qr` نصب می‌کنه، تنظیمات رو در `/etc/bale-config-qr.env` ذخیره می‌کنه و سرویس systemd به اسم `bale-config-qr` رو فعال و اجرا می‌کنه (بعد از ریبوت هم خودش بالا میاد).

در حالت webhook، بله پیام‌ها رو به `https://<your-domain>/webhook/<secret>` می‌فرسته. reverse proxy رو طوری تنظیم کن که اون آدرس رو به `http://127.0.0.1:8080` بفرسته.

نصب بدون سؤال (مثلاً برای اسکریپت):

```bash
curl -fsSL https://raw.githubusercontent.com/samaelleo/bale-config-qr/main/install.sh | sudo BOT_TOKEN=YOUR_TOKEN WEBHOOK_URL= bash
```

## آپدیت

همون دستور نصب رو دوباره بزن و به سؤال `Keep it?` جواب `Y` بده تا تنظیمات قبلی حفظ بشه.

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

تغییر توکن یا webhook: فایل `/etc/bale-config-qr.env` رو ویرایش کن و سرویس رو ری‌استارت کن، یا نصب رو دوباره اجرا کن و به `Keep it?` جواب `n` بده.

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
