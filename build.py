"""Generate the static site: one page per tool + a homepage grid.

    python3 build.py                              # pages only
    python3 build.py --site https://example.com   # + canonical links, sitemap.xml, robots.txt

Every tool page is the same app (src/tool.html + assets/app.js); data-tool picks its mode in app.js (TOOLS).
"""
import html
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
BRAND = 'QR Studio'

PRIVACY = ('Are my images or data uploaded anywhere?',
           'No. Everything runs in your browser: the image is read, edited and turned into a new QR code on your own device. '
           'Nothing is sent to a server. The first time you use AI field naming, your browser downloads a small 23 MB model once and keeps it cached.')
FREE = ('Is it free? Do the codes expire?',
        'Free, with no sign-up and no watermark. The codes are standard static QR codes: the content lives inside the code itself, '
        'not behind a redirect link we control, so they keep working forever, even if this website disappears.')

TOOLS = [
    dict(slug='qr-code-reader', icon='⌗', name='QR code reader', card='Scan a QR code from an image, screenshot or camera.',
         title='QR Code Reader Online: Scan from Image or Camera, Free',
         description='Read any QR code from an image, screenshot or your camera and see exactly what is inside, in plain English. Free, no sign-up, nothing uploaded.',
         h1='QR code reader', sub='Scan a QR code from an image, a screenshot or your camera, and see exactly what’s inside in plain English.',
         howto=[('Open the code', 'Drop an image, paste a screenshot, or switch to your camera.'),
                ('See what it does', 'Get a one-line summary, safety checks and every field inside.'),
                ('Copy or edit', 'Copy the text, or change it and download a new code.')],
         faq=[('Can it read a QR code from a screenshot?', 'Yes. Take the screenshot, then press Ctrl+V (⌘+V on Mac) on this page. You can also drop or choose the image file.'),
              ('It says “No QR code found”. What can I do?', 'Use a sharper, straighter photo and crop closer around the code. Very small, blurry or heavily angled codes are the usual cause.'),
              ('Does the camera work on my phone?', 'Yes. Tap “Use camera” and allow access; the back camera is used and the code is read automatically. It needs a secure (https) connection, which this site uses.'),
              PRIVACY, FREE]),
    dict(slug='edit-qr-code', icon='✎', name='Edit a QR code', card='Change what’s inside an existing code and download a new one.',
         title='Edit a QR Code Online: Change the Link, Text or Data, Free',
         description='Open an existing QR code, change the link, name, ID or any field inside, and download a new code that works the same way. Free, no sign-up.',
         h1='Edit a QR code', sub='Open an existing QR code, change what’s inside (a link, a name, an ID) and download a new code that works the same way.',
         howto=[('Open the code', 'Upload an image, paste a screenshot or use your camera.'),
                ('Change any field', 'Everything inside shows as simple fields. Edits are tracked and can be reset.'),
                ('Download the new code', 'PNG, SVG or copy it. It is scan-tested before you download.')],
         faq=[('Can I change a QR code that is already printed?', 'No. The content of a printed code is fixed. What you can do is make a new code with the edited content and replace the print. (If your code came from a paid “dynamic QR” service, change it in that service’s dashboard instead.)'),
              ('Will the new code look like the old one?', 'It keeps the same grid size when the new content fits, and you can set colours, a logo and the border under “Style & size”.'),
              ('What kinds of QR codes can I edit?', 'Links, plain text, Wi-Fi, contacts (vCard and MECARD), email, phone, SMS, map locations, UPI payments, JSON, key–value and delimited data such as ID-card codes.'),
              PRIVACY, FREE]),
    dict(slug='qr-code-safety-checker', icon='🛡', name='Is this QR code safe?', card='Check a QR code for phishing and payment scams before you open it.', new=True,
         title='Is This QR Code Safe? Free QR Code Phishing Checker',
         description='Check a QR code before you open it: see where the link really goes and get warnings for phishing tricks, hidden short links and payment scams. Free, nothing uploaded.',
         h1='Is this QR code safe?', sub='See where a QR code really leads before you open it, with warnings for phishing tricks, hidden short links and swapped payment codes.',
         howto=[('Open the code', 'Upload a photo or screenshot, or scan it with your camera.'),
                ('Read the verdict', 'A plain-English summary of what the code does, plus any red flags.'),
                ('Decide', 'Only open links and pay payees you actually expected.')],
         faq=[('What does it check?', 'Links that mention a brand but belong to a different site, bare IP addresses, look-alike letters (punycode), links hiding their destination with “@”, shortened links, app downloads, unusual domain endings, unencrypted http, open Wi-Fi, and the payee on UPI payment codes.'),
              ('Can it guarantee that a link is safe?', 'No. The checks look at the code itself and run in your browser; the link is not looked up online. A brand-new scam site with an innocent-looking name can pass. Treat “no red flags” as “nothing obvious”, not as a guarantee.'),
              ('What is QR code phishing (“quishing”)?', 'Scammers put their own QR codes on posters, parking meters, emails or restaurant tables. The code opens a fake login or payment page. Checking where a code leads before you open it is the simplest defence.'),
              ('How do I check a payment QR code?', 'Open it here and compare the payee name and UPI ID with who you expect to pay. Stickers placed over a shop’s real code are a common scam.'),
              PRIVACY]),
    dict(slug='bulk-qr-code-generator', icon='▦', name='Bulk QR code generator', card='Make hundreds of numbered codes from a range or a spreadsheet.',
         title='Bulk QR Code Generator: From Excel/CSV or a Number Range, Free',
         description='Generate hundreds of QR codes at once for ID cards, tickets, assets or members, from a number range or a CSV/Excel sheet. Download a ZIP or print a sheet. Free.',
         h1='Bulk QR code generator', sub='Make hundreds of QR codes at once for ID cards, tickets, assets or members, from a number range or a spreadsheet.',
         howto=[('Set up one code', 'Edit the fields, or open an existing code to copy its format.'),
                ('Choose the series', 'Count up an ID (keeping leading zeros) or upload a CSV with one row per code.'),
                ('Download or print', 'Get a ZIP of PNGs plus an index spreadsheet, or print a sheet / save as PDF.')],
         faq=[('How do I make one code per employee from Excel?', 'Click “From spreadsheet (CSV)”, download the CSV template, fill in one row per person in Excel or Google Sheets, save as CSV, and upload it.'),
              ('Will leading zeros like 00123 be kept?', 'Yes in number-range mode. In a spreadsheet, Excel may drop them, so format the ID column as Text before typing.'),
              ('Can I print the codes on labels?', 'Yes. “Print sheet / PDF” lays the codes out on A4 in 25, 40 or 60 mm sizes with the ID printed underneath. Choose “Save as PDF” in the print dialog for a file.'),
              ('What if two rows have the same ID?', 'Duplicates are flagged in red before you download, so every code stays unique.'),
              PRIVACY, FREE]),
    dict(slug='bulk-qr-code-reader', icon='⇶', name='Bulk QR code reader', card='Read many QR images at once and export a spreadsheet.',
         title='Bulk QR Code Reader: Decode Many Images to CSV, Free',
         description='Decode many QR code images at once and download the contents as a spreadsheet (CSV). Free, no sign-up, images never uploaded.',
         h1='Bulk QR code reader', sub='Drop many QR code images at once and get everything that’s inside as a spreadsheet.',
         howto=[('Drop your images', 'Select or drag in as many QR images as you like.'),
                ('Review the table', 'See each file’s contents and type; unreadable ones are marked.'),
                ('Export', 'Download a CSV, or click Edit on any row to change that code.')],
         faq=[('How many images can I read at once?', 'There is no fixed limit. Hundreds work fine on a normal laptop; it depends on your device’s memory.'),
              ('What’s in the spreadsheet?', 'One row per image: file name, whether a code was found, its type (link, Wi-Fi, contact…) and the full contents.'),
              ('Which image types work?', 'Anything your browser can open: PNG, JPG, WebP, GIF and screenshots. Safari can also open iPhone HEIC photos.'),
              PRIVACY]),
    dict(slug='wifi-qr-code-generator', icon='📶', name='Wi-Fi QR code', card='Let guests join your Wi-Fi by scanning a code.',
         title='Wi-Fi QR Code Generator: Share Your Wi-Fi Password, Free',
         description='Create a QR code that joins your Wi-Fi network when scanned, with no typing of passwords. Free, no sign-up, your password never leaves your device.',
         h1='Wi-Fi QR code generator', sub='Let guests join your Wi-Fi by scanning a code, with no typing of long passwords.',
         howto=[('Enter your network', 'Type the network name and password, and pick the security type (usually WPA).'),
                ('Check the preview', 'The code is scan-tested as you type.'),
                ('Print it', 'Download PNG or SVG and stick it on the wall or the router.')],
         faq=[('Which phones can scan it?', 'Most modern iPhone and Android camera apps offer to join the network straight away.'),
              ('Is my Wi-Fi password safe?', 'It is created in your browser and never sent anywhere. But the password is stored inside the code, so anyone who can scan the printed code can join.'),
              ('What security type should I choose?', 'Use WPA for almost all home and office routers (it covers WPA2 too). Use “nopass” only for open networks.'),
              FREE]),
    dict(slug='upi-qr-code-generator', icon='₹', name='UPI payment QR', card='Get paid by any UPI app: GPay, PhonePe, Paytm, BHIM.',
         title='UPI QR Code Generator: Payment QR for GPay, PhonePe, Paytm, Free',
         description='Make a UPI payment QR code with your UPI ID, name and an optional fixed amount. Works with GPay, PhonePe, Paytm and BHIM. Free, no sign-up.',
         h1='UPI payment QR code generator', sub='Make a payment QR with your UPI ID, name and an optional fixed amount. Works with any UPI app.',
         howto=[('Enter your UPI ID', 'Add your UPI ID and name; set an amount or remove it.'),
                ('Test it', 'Scan the preview with your own UPI app before sharing.'),
                ('Share or print', 'Download PNG or SVG for your counter, invoice or chat.')],
         faq=[('Which apps can pay with it?', 'Any UPI app, including Google Pay, PhonePe, Paytm and BHIM.'),
              ('Can the customer enter the amount?', 'Yes. Remove the Amount field (✕) and the payer types the amount in their app.'),
              ('Is this the same as my bank’s merchant QR?', 'It uses the standard UPI payment link format, which suits personal and small-business use. Registered merchants may get extra features (such as settlement reports) from their bank’s own QR.'),
              ('How do I stay safe with payment QR codes?', 'Always test your code by scanning it yourself, and check printed codes regularly: scammers sometimes stick their own code over a shop’s.'),
              FREE]),
    dict(slug='vcard-qr-code-generator', icon='👤', name='Contact (vCard) QR', card='Share your contact details with one scan.',
         title='vCard QR Code Generator: Contact QR for Business Cards, Free',
         description='Create a contact QR code (vCard) that saves your name, phone, email and company in one scan. Great for business cards and badges. Free, no sign-up.',
         h1='Contact (vCard) QR code generator', sub='Put your name, phone, email and company in a QR code that saves you as a contact in one scan.',
         howto=[('Fill in your details', 'Edit the name, company, phone and email fields.'),
                ('Add more if needed', 'Use “+ Add field” and set its key, e.g. URL for a website or ADR for an address.'),
                ('Download', 'PNG or SVG for business cards, badges and email signatures.')],
         faq=[('What is a vCard QR code?', 'A QR code that holds a contact card in the standard vCard format. Phones offer to save it straight to contacts.'),
              ('Which fields can I include?', 'Name, organisation, job title, phones, emails, website (URL), address (ADR), notes and more. Each field’s key is shown under its name.'),
              ('Why is my code so dense?', 'More details mean more data. Keep only what people need, and use SVG for print so it stays sharp at small sizes.'),
              FREE]),
]

WHY = [('Private by design', 'Images are read on your device. Nothing is uploaded.'),
       ('Understands what’s inside', 'Links, Wi-Fi, contacts, payments and data records shown as plain fields.'),
       ('Safety check built in', 'Spots phishing tricks and swapped payment codes before you open them.'),
       ('Codes that never expire', 'Static QR codes with no redirect, no account and no watermark.')]


def e(s):
    return html.escape(s, quote=True)


def render(tpl, **kw):
    for k, v in kw.items():
        tpl = tpl.replace('{{' + k + '}}', v)
    assert '{{' not in tpl.replace('{{root}}', ''), 'unfilled placeholder'
    return tpl


def tools_grid(root, current=None):
    cards = ''.join(
        f'<a class="tool-card" href="{root}{t["slug"]}/"{" aria-current=page" if t["slug"] == current else ""}>'
        f'<span class="ic" aria-hidden="true">{t["icon"]}</span><b>{e(t["name"])}{"<span class=new>NEW</span>" if t.get("new") else ""}</b><span>{e(t["card"])}</span></a>'
        for t in TOOLS)
    return f'<div class="tools-grid">{cards}</div>'


def footer(root):
    links = ''.join(f'<a href="{root}{t["slug"]}/">{e(t["name"])}</a>' for t in TOOLS)
    return f'<footer class="site"><span>{BRAND}: free QR tools that run in your browser. Your files never leave your device.</span><nav>{links}</nav></footer>'


def faq_html(faq):
    return ''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in faq)


def jsonld(t, site):
    app = {'@context': 'https://schema.org', '@type': 'WebApplication', 'name': f'{t["name"]} · {BRAND}',
           'description': t['description'], 'applicationCategory': 'UtilitiesApplication', 'operatingSystem': 'Any (web browser)',
           'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'}}
    if site:
        app['url'] = f'{site}/{t["slug"]}/'
    faq = {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in t['faq']]}
    return json.dumps([app, faq], ensure_ascii=False).replace('</', '<\\/')


def main():
    site = sys.argv[sys.argv.index('--site') + 1].rstrip('/') if '--site' in sys.argv else ''
    tool_tpl = (ROOT / 'src/tool.html').read_text()
    home_tpl = (ROOT / 'src/home.html').read_text()
    canon = lambda path: f'<link rel="canonical" href="{site}/{path}">\n' if site else ''

    for t in TOOLS:
        root = '../'
        content = ('<section class="content"><h2>How it works</h2><ol class="howto">'
                   + ''.join(f'<li><b>{e(a)}</b><span>{e(b)}</span></li>' for a, b in t['howto']) + '</ol>'
                   + f'<h2>Questions</h2><div class="faq">{faq_html(t["faq"])}</div>'
                   + f'<h2>More free QR tools</h2>{tools_grid(root, t["slug"])}</section>')
        page = render(tool_tpl, root=root, title=e(f'{t["title"]} | {BRAND}'), description=e(t['description']), canonical=canon(t['slug'] + '/'),
                      h1=e(t['h1']), sub=e(t['sub']), tool=t['slug'], content=content, footer=footer(root), jsonld=jsonld(t, site))
        out = ROOT / t['slug'] / 'index.html'
        out.parent.mkdir(exist_ok=True)
        out.write_text(page)

    why = ''.join(f'<div><b>{e(a)}</b><span>{e(b)}</span></div>' for a, b in WHY)
    home_faq = [PRIVACY, FREE, ('How is this different from other QR code sites?',
                'Most QR sites only make codes, and many upload your files or put your codes behind their own redirect links. '
                'QR Studio opens existing codes, explains what they do, warns about scams, and lets you edit and re-create them, all on your device.')]
    home_ld = json.dumps({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in home_faq]}, ensure_ascii=False).replace('</', '<\\/')
    (ROOT / 'index.html').write_text(render(home_tpl, root='./', canonical=canon(''), tools=tools_grid('./'), why=why,
                                            faq=faq_html(home_faq), footer=footer('./'), jsonld=home_ld))

    if site:
        urls = [''] + [t['slug'] + '/' for t in TOOLS]
        (ROOT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                          + ''.join(f'  <url><loc>{site}/{u}</loc></url>\n' for u in urls) + '</urlset>\n')
        (ROOT / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {site}/sitemap.xml\n')
    print(f'built home + {len(TOOLS)} tool pages' + (f' for {site}' if site else ' (no --site: skipped canonical/sitemap)'))


if __name__ == '__main__':
    main()
