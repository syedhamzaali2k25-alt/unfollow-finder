#!/usr/bin/env python3
"""
fix-blog-images.py — run from the ROOT of your unfollow-finder repo.

    python fix-blog-images.py

Fixes blog article images being stretched vertically after apply-fixes.py.

What went wrong: apply-fixes.py added width/height attributes to every <img>
so the browser can reserve space and stop layout shift. That is correct, but
it only works when the CSS also says `height: auto` — otherwise the height
attribute becomes a fixed height.

blog.css has:

    .article-img img { width: 100%; height: auto; }

…but in the HTML the class sits on the <img> itself, not on a wrapper:

    <img class="article-img" ...>

so that rule never matched. Without `height: auto`, `height="682"` became a
literal 682px and the photo stretched.

Measured across 12 pages: 43 images were unaffected, 18 `article-img` photos
were stretched. Example — blogs_16 rendered 712x475 before, 712x1067 after.

This adds the missing selector. Nothing else changes.
"""
import os
import re
import shutil
import sys

CSS = os.path.join('blogs', 'blog.css')

OLD = """.article-img img {
  width: 100%;
  height: auto;
  border-radius: var(--r-lg);
  display: block;
}"""

NEW = """.article-img img,
img.article-img {
  width: 100%;
  height: auto;
  border-radius: var(--r-lg);
  display: block;
}"""

MARKER = 'img.article-img'


def main():
    if not os.path.isfile(CSS):
        print(f'ERROR: {CSS} not found — run this from the repo root')
        sys.exit(1)

    s = open(CSS, encoding='utf8').read()

    if MARKER in s:
        print('already fixed — nothing to do')
        return

    if OLD not in s:
        print('ERROR: could not find the .article-img rule in blogs/blog.css.')
        print('       Add this by hand instead:')
        print()
        print('         img.article-img { width: 100%; height: auto; }')
        sys.exit(1)

    shutil.copy2(CSS, CSS + '.bak')
    open(CSS, 'w', encoding='utf8').write(s.replace(OLD, NEW, 1))

    print('==> blogs/blog.css updated (backup: blogs/blog.css.bak)')
    print('    img.article-img now gets height:auto, so the 18 blog photos')
    print('    render at their real aspect ratio again.')

    fix_relative_paths()

    print()
    print('    revert:  copy blogs\\blog.css.bak blogs\\blog.css')


def fix_relative_paths():
    """A second, older bug in the same place.

    Pages under /blogs/ referenced images without a leading slash:

        <img src="image/step-9.webp">

    Served at /blogs/how-to-download-instagram-data, that resolves to
    /blogs/image/step-9.webp, which does not exist — so the image has been
    broken on the live site for a while. It used to collapse to a 33px sliver
    and went unnoticed; now that width/height reserve real space, it leaves an
    obvious 745px gap. Root-level pages are unaffected, because there the same
    relative path happens to resolve correctly.
    """
    import glob
    n = 0
    for f in glob.glob(os.path.join('blogs', '*.html')):
        s = open(f, encoding='utf8').read()
        o = re.sub(r'(<img[^>]*\ssrc=")(?!/)(?!https?:)(?!data:)image/', r'\1/image/', s)
        if o != s:
            shutil.copy2(f, f + '.bak')
            open(f, 'w', encoding='utf8').write(o)
            n += len(re.findall(r'<img[^>]*\ssrc="image/', s))
            print(f'    fixed broken image path in {os.path.basename(f)}')
    if n == 0:
        print('    no broken relative image paths found')


if __name__ == '__main__':
    main()