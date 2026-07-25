#!/usr/bin/env python3
"""
Non-interactive drizzle-kit generate runner.
Always selects the first option (create table / create column) for all prompts.
Uses raw terminal interaction since drizzle-kit uses an interactive prompt library.
"""
import pexpect
import sys
import os
import time

os.chdir('/home/ubuntu/geeves-shopping')

child = pexpect.spawn('npx drizzle-kit generate', timeout=180, encoding='utf-8',
                      dimensions=(50, 200))

output = ""

while True:
    try:
        # Read whatever is available
        chunk = child.read_nonblocking(size=4096, timeout=10)
        output += chunk
        sys.stdout.write(chunk)
        sys.stdout.flush()
        
        # Check if we see a selection prompt (the ❯ character indicates a selection menu)
        if '❯' in chunk or 'create table' in chunk or 'create column' in chunk:
            time.sleep(0.5)
            # Press Enter to select the first (already highlighted) option
            child.send('\r')
            time.sleep(0.3)
        
    except pexpect.exceptions.TIMEOUT:
        # No more output for 10 seconds - might be done
        time.sleep(1)
        if not child.isalive():
            break
        # Try one more read
        try:
            chunk = child.read_nonblocking(size=4096, timeout=5)
            output += chunk
            sys.stdout.write(chunk)
            sys.stdout.flush()
            if '❯' in chunk or 'create' in chunk:
                time.sleep(0.3)
                child.send('\r')
        except:
            break
    except pexpect.exceptions.EOF:
        break
    except Exception as e:
        print(f'\n[ERROR] {e}')
        break

child.close()
print(f'\nExit status: {child.exitstatus}')
sys.exit(0 if child.exitstatus == 0 else 1)
