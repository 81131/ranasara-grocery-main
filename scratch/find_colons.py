import os
import re

def find_suspicious_colons(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(('.jsx', '.tsx', '.js', '.ts')):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', errors='ignore') as f:
                        content = f.read()
                        # Find all colons
                        for i, char in enumerate(content):
                            if char == ':':
                                before = content[max(0, i-50):i]
                                after = content[i:min(len(content), i+50)]
                                
                                # Check for <ns:tag or attr:name=
                                is_namespaced_tag = re.search(r'<\w+:\w+', before + after)
                                is_namespaced_attr = re.search(r'\w+:\w+=', before + after)
                                
                                if is_namespaced_tag or is_namespaced_attr:
                                    # Check if it's inside quotes
                                    if not (before.count('"') % 2 == 1 or before.count("'") % 2 == 1):
                                        print(f"Suspicious colon in {path}:")
                                        print(f"Context: ...{before[-30:]}:{after[:30]}...")
                                        print("-" * 20)
                except Exception as e:
                    print(f"Error reading {path}: {e}")

find_suspicious_colons('/home/dinindu/Documents/ai-grocery-tobeintegrated-main/frontend/src')
