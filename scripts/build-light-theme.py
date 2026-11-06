"""Keep the light theme's geometry aligned with the existing dark design."""
import colorsys,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'app/version2-dark.css').read_text()
# Semantic counterparts for neutral surfaces, text, brand accents and status tones.
palette={
 '#080808':'#fffaf5','#171717':'#efebe5','#151515':'#ffffff','#161616':'#fffdf9','#181818':'#fffdf9','#1b1b1b':'#fffdf9','#111':'#fff8f0','#222':'#f4ede5','#202020':'#f7f0e8','#252525':'#fffdf9','#292929':'#f1e8de','#1c1c1ce8':'#fffdf9ef',
 '#fff':'#261d18','#f6f6f6':'#2b211c','#f5f5f5':'#2b211c','#f3f3f3':'#362b24','#eee':'#3f332b','#ddd':'#514339','#ccc':'#635349','#bbb':'#706055','#aaa':'#77685c','#999':'#7b6c60','#bdbdbd':'#706055','#b6b6b6':'#76675c','#b5b5b5':'#76675c','#c3c3c3':'#6c5b50',
 '#282828':'#e7dcd0','#2b2b2b':'#e7dcd0','#2c2c2c':'#e5d8cb','#303030':'#e3d6c9','#333':'#ddcfbf','#363636':'#dfd0c0','#3b3b3b':'#c9b7a5','#414141':'#c9b7a5','#444':'#bfa994',
 '#ff7043':'#ff7043','#e65b30':'#e65b30','#ffab87':'#9b3d1f','#ff986e':'#a44120','#ff946d':'#ad4423','#ffb18c':'#9d3e21','#ffb28f':'#9d3e21','#ffd0b5':'#9a3d1f','#ffbd9e':'#a64122','#190b05':'#190b05','#1b100b':'#1b100b',
 '#ff70431c':'#ff704318','#ff704326':'#ff70431f','#ff704328':'#ff704321','#ff8b61':'#ff8b61',
 '#351b13':'#fff0e4','#151212':'#fffdf9','#2e1b13':'#fff0e2','#261a14':'#fff0e3','#241a15':'#fff1e6','#231914':'#fff1e6','#51392b':'#e3bfa7','#5b3928':'#d9b298',
 '#252a21':'#edf5e7','#414b38':'#cbdcbe','#cbddb9':'#3a5c2c','#192b22':'#e9f5ec','#b6dec3':'#285d39','#395847':'#bfd7c5','#301715':'#fff0eb','#ffc5b6':'#9b3022','#6c362a':'#dba697',
 '#322519':'#fff1d8','#e7bc86':'#80521d','#301d18':'#fff0e8','#38211d':'#fff0eb','#ffd0c4':'#9b3022','#874b40':'#dcae9e',
 '#ffffff26':'#dac7b5a0','#ffffff30':'#dac7b5b0','#ffffff35':'#dac7b5b0',
 '#0005':'#3827190c','#0006':'#38271912','#0007':'#38271918','#0009':'#38271922','#000b':'#26170f70'
}
def counterpart(match):
 value=match[0].lower()
 if value in palette:return palette[value]
 h=value[1:]
 if len(h) in (3,4):h=''.join(c*2 for c in h)
 r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
 hue,lum,sat=colorsys.rgb_to_hls(r,g,b)
 # Unnamed warm tones become peach surfaces/borders or dark muted text.
 if lum<.22:result='#fff1e6'
 elif lum<.48:result='#ddc2ac'
 elif lum<.68:result='#776052'
 else:result='#694b38'
 if 65<hue*360<175:
  result='#eef5e9' if lum<.22 else '#bfd1b5' if lum<.48 else '#385735'
 return result+(h[6:] if len(h)==8 else '')
def light_rule(match):
 selector,body=match.groups()
 # Photographic overlays and the camera viewfinder need their original contrast.
 if any(part in selector for part in ('.coffee-photo-', '.promotion-shade', '.promotion-copy', '.promotion-heading', '.promotion-tag', '.scanner-camera')):
  return selector+'{'+body+'}'
 return selector+'{'+re.sub(r'#[0-9a-fA-F]{3,8}\b',counterpart,body)+'}'
light=source.replace('html[data-theme="dark"]','html[data-theme="light"]')
light=re.sub(r'([^{}]+)\{([^{}]*)\}',light_rule,light).replace('color-scheme:dark','color-scheme:light')
light='/* Light counterpart of version2-dark.css. Regenerate with scripts/build-light-theme.py. */\n'+light
light+='''
/* Keep active controls readable on the shared orange accent. */
html[data-theme="light"] .appearance-settings button[aria-pressed="true"]{color:#190b05}
html[data-theme="light"] .entry-theme-toggle{background:#fffdf9;border-color:#ddcfbf;color:#9b3d1f}
html[data-theme="light"] .dribbble-theme .product-card:hover{border-color:#d9aa88}
'''
(root/'app/version2-light.css').write_text(light)
print('Generated light counterpart with matching layout and responsive rules')
