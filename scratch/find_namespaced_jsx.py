import os
import re

def find_suspicious_colons(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".jsx"):
                path = os.path.join(root, file)
                with open(path, 'r') as f:
                    content = f.read()
                    
                    # Remove comments
                    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
                    content = re.sub(r'//.*', '', content)
                    
                    # Find all JSX tags
                    tags = re.findall(r'<[a-zA-Z].*?>', content, flags=re.DOTALL)
                    for tag in tags:
                        # Find colons in the tag that are NOT inside strings and NOT inside curly braces
                        in_string = False
                        quote_char = ''
                        in_brace = 0
                        
                        for i, char in enumerate(tag):
                            if char in ['"', "'", '`'] and not in_brace:
                                if not in_string:
                                    in_string = True
                                    quote_char = char
                                elif quote_char == char:
                                    in_string = False
                            elif char == '{' and not in_string:
                                in_brace += 1
                            elif char == '}' and not in_string:
                                in_brace -= 1
                            elif char == ':' and not in_string and not in_brace:
                                print(f"Suspicious colon in {path}: {tag.strip()}")
                                break

find_suspicious_colons("frontend/src")
