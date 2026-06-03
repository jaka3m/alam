import re

with open('_worker.js', 'r') as f:
    content = f.read()

# 1. Update general sizes in the main css definitions:
content = re.sub(r'\.country\{font-size:15px;', '.country{font-size:16px;', content)
content = re.sub(r'\.endpoint\{font:11px', '.endpoint{font:12px', content)
content = re.sub(r'\.check\{\n\s+min-width:78px;height:29px;.*?font-size:9px;',
                 lambda m: m.group(0).replace('font-size:9px', 'font-size:11px').replace('height:29px', 'height:32px'), content)
content = re.sub(r'\.provider small\{.*?font-size:8px;',
                 lambda m: m.group(0).replace('font-size:8px', 'font-size:10px'), content)
content = re.sub(r'\.provider strong\{font-size:12px;', '.provider strong{font-size:14px;', content)
content = re.sub(r'\.metric\{\n\s+display:flex.*?font:9px',
                 lambda m: m.group(0).replace('font:9px', 'font:12px'), content)
content = re.sub(r'\.config-main\{\n\s+height:41px;.*?font-size:11px;',
                 lambda m: m.group(0).replace('font-size:11px', 'font-size:13px').replace('height:41px', 'height:44px'), content)
content = re.sub(r'\.choose-label\{font-size:8px;', '.choose-label{font-size:11px;', content)
content = re.sub(r'\.mode,\.copy\{\n\s+min-width:0;height:34px;.*?font-size:9px;',
                 lambda m: m.group(0).replace('font-size:9px', 'font-size:12px').replace('height:34px', 'height:38px'), content)

# 2. Update the media queries

# HP (max-width: 640px)
content = re.sub(r'@media \(max-width: 640px\) \{.*?\}  \n  \.server \{', '@media (max-width: 640px) {\n  .list {\n    grid-template-columns: 1fr !important;\n    gap: 12px;\n  }\n  \n  .server {', content, flags=re.DOTALL) # just to anchor if needed

# Let's replace using regex substitutions for the max-width blocks.
import textwrap

def replace_media_queries(text):
    # For 640px
    text = re.sub(r'\.country\s*\{\s*font-size:\s*14px;\s*\}', '.country {\n    font-size: 16px;\n  }', text)
    text = re.sub(r'\.endpoint\s*\{\s*font-size:\s*8px;', '.endpoint {\n    font-size: 11px;', text)
    text = re.sub(r'\.check\s*\{\s*min-width:\s*65px;\s*height:\s*26px;\s*font-size:\s*8px;\s*\}', '.check {\n    min-width: 65px;\n    height: 30px;\n    font-size: 10px;\n  }', text)
    text = re.sub(r'\.metric\s*\{\s*font-size:\s*8px;', '.metric {\n    font-size: 11px;', text)
    text = re.sub(r'\.mode-row,\s*\.protocol-row\s*\{\s*grid-template-columns:\s*1fr;\s*gap:\s*6px;\s*\}', '.mode-row {\n    grid-template-columns: 1fr;\n    gap: 6px;\n  }\n  .protocol-row {\n    grid-template-columns: repeat(3, minmax(0, 1fr));\n    gap: 6px;\n  }', text)
    text = re.sub(r'\.config-main\s*\{\s*height:\s*38px;\s*font-size:\s*10px;\s*\}', '.config-main {\n    height: 42px;\n    font-size: 12px;\n  }', text)

    # For 480px
    text = re.sub(r'\.country\s*\{\s*font-size:\s*12px;\s*\}', '.country {\n    font-size: 15px;\n  }', text)
    text = re.sub(r'\.endpoint\s*\{\s*font-size:\s*7px;', '.endpoint {\n    font-size: 10px;', text)
    text = re.sub(r'\.check\s*\{\s*min-width:\s*55px;\s*height:\s*24px;\s*font-size:\s*7px;\s*gap:\s*4px;\s*\}', '.check {\n    min-width: 55px;\n    height: 28px;\n    font-size: 10px;\n    gap: 4px;\n  }', text)
    text = re.sub(r'\.provider\s*strong\s*\{\s*font-size:\s*10px;\s*\}', '.provider strong {\n    font-size: 13px;\n  }', text)
    text = re.sub(r'\.metric\s*\{\s*font-size:\s*7px;', '.metric {\n    font-size: 10px;', text)
    text = re.sub(r'\.config-main\s*\{\s*height:\s*34px;\s*font-size:\s*9px;\s*\}', '.config-main {\n    height: 38px;\n    font-size: 12px;\n  }', text)
    text = re.sub(r'\.mode,\s*\.copy\s*\{\s*height:\s*30px;\s*font-size:\s*8px;\s*\}', '.mode, .copy {\n    height: 34px;\n    font-size: 10px;\n  }', text)

    return text

content = replace_media_queries(content)

with open('_worker.js', 'w') as f:
    f.write(content)
print("Done updating CSS")
