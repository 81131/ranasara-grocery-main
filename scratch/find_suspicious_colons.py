import os
import re

def find_suspicious_jsx_colons(directory):
    suspicious = []
    # Regex to find potential JSX tags
    # This is a simple one, it might have false positives
    tag_re = re.compile(r'<([a-zA-Z0-9]+)\s+([^>]+)>')
    
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(('.jsx', '.js', '.tsx', '.ts')):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', errors='ignore') as f:
                        lines = f.readlines()
                        for line_no, line in enumerate(lines, 1):
                            # Look for namespaced tags: <ns:tag
                            tag_matches = re.finditer(r'<([a-zA-Z0-9]+):([a-zA-Z0-9]+)', line)
                            for match in tag_matches:
                                suspicious.append(f"TAG {path}:{line_no}: {line.strip()}")
                            
                            # Look for namespaced attributes: attr:name=
                            attr_matches = re.finditer(r'([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)\s*=', line)
                            for match in attr_matches:
                                suspicious.append(f"ATTR {path}:{line_no}: {line.strip()}")
                except:
                    pass
    return suspicious

if __name__ == "__main__":
    results = find_suspicious_jsx_colons('frontend/src')
    for res in results:
        print(res)
