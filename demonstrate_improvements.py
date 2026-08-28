#!/usr/bin/env python3
"""Demonstration of enhanced file system and terminal capabilities."""

import json
import os
from datetime import datetime
import subprocess


def demo_file_metadata():
    """Demonstrate file metadata enumeration."""
    print("=" * 60)
    print("1. FILE METADATA ENUMERATION")
    print("-" * 40)
    try:
        result = subprocess.run(
            ['dir', '/b', '/a-d'],
            capture_output=True, text=True,
            cwd=r'C:\Users\bharg_4mtuttl\Desktop\BGK_Applications\AI ChatBot'
        )
        files = [f for f in result.stdout.strip().split('\n') if f]
        print(f"Found {len(files)} items in AI ChatBot directory")
        for f in files[:10]:
            print(f"  📄 {f}")
        if len(files) > 10:
            print(f"  ... and {len(files) - 10} more")
    except Exception as e:
        print(f"  Error: {e}")


def demo_enhanced_search():
    """Demonstrate enhanced content search."""
    print("\n2. ENHANCED CONTENT SEARCH")
    print("-" * 40)
    try:
        result = subprocess.run(
            ['findstr', '/i', '/s', 'shared-ui',
             r'C:\Users\bharg_4mtuttl\Desktop\BGK_Applications\AI ChatBot\*.json'],
            capture_output=True, text=True
        )
        matches = [line for line in result.stdout.split('\n') if line.strip()]
        print(f"Found {len(matches)} references to 'shared-ui'")
        for m in matches[:5]:
            print(f"  🔍 {m[:100]}")
    except Exception as e:
        print(f"  Error: {e}")


def demo_backup_workflow():
    """Demonstrate automated backup workflow."""
    print("\n3. AUTOMATED BACKUP WORKFLOW")
    print("-" * 40)
    backup_dir = r'C:\Users\bharg_4mtuttl\Desktop\BGK_Applications\AI ChatBot\backups_demo'
    os.makedirs(backup_dir, exist_ok=True)

    src_file = os.path.join(
        r'C:\Users\bharg_4mtuttl\Desktop\BGK_Applications\AI ChatBot',
        'package.json'
    )
    dst_file = os.path.join(
        backup_dir,
        f'package.json.backup.{datetime.now().strftime("%Y%m%d%H%M%S")}'
    )

    try:
        if os.path.exists(src_file):
            with open(src_file, 'r') as f_read:
                content = f_read.read()
            with open(dst_file, 'w') as f_write:
                f_write.write(content)
            print(f"✅ Backup created: {dst_file}")
            print(f"   Original size: {len(content)} bytes")
        else:
            print(f"⚠️ Source file not found: {src_file}")
    except Exception as e:
        print(f"  Error creating backup: {e}")


def demo_template_generation():
    """Demonstrate component template generation."""
    print("\n4. FILE TEMPLATE GENERATION")
    print("-" * 40)

    template = (
        "// {{COMPONENT_NAME}} Component\n"
        "// Auto-generated on {{DATE}}\n\n"
        "import React from 'react';\n"
        "import {{IMPORTS}} from '{{PACKAGE_NAME}}';\n\n"
        "export const {{COMPONENT_NAME}} = (\n"
        "  {{\n"
        "    {{PROPS}}\n"
        "  }} => {{\n"
        "    return (\n"
        "      <div className=\"{{STYLED_COMPONENT}}\">\n"
        "        {/* Component content goes here */}\n"
        "      </div>\n"
        "    );\n"
        "  }});\n\n"
        "export default {{COMPONENT_NAME}};"
    )

    generated = template.replace('{{COMPONENT_NAME}}', 'SharedUI') \
        .replace('{{DATE}}', datetime.now().strftime('%Y-%m-%d %H:%M:%S')) \
        .replace('{{IMPORTS}}', 'useSharedStyles') \
        .replace('{{PACKAGE_NAME}}', '@my-app/shared-ui') \
        .replace('{{PROPS}}', 'props: Record<string, any>') \
        .replace('{{STYLED_COMPONENT}}', 'shared-ui-component')

    template_path = os.path.join(backup_dir if 'backup_dir' in dir() else r'C:\Users\bharg_4mtuttl\Desktop\BGK_Applications\AI ChatBot\backups_demo', 'Component_Template.txt')
    os.makedirs(r'C:\Users\bharg_4mtuttl\Desktop\BGK_Applications\AI ChatBot\backups_demo', exist_ok=True)
    template_path = os.path.join(r'C:\Users\bharg_4mtuttl\Desktop\BGK_Applications\AI ChatBot\backups_demo', 'Component_Template.txt')
    with open(template_path, 'w') as f:
        f.write(generated)

    print(f"✅ Component template created: {template_path}")
    print(f"   Generated component: SharedUI")
    print(f"   Ready for: @my-app/shared-ui package")


def demo_package_validation():
    """Demonstrate package configuration validation."""
    print("\n5. PACKAGE CONFIGURATION VALIDATION")
    print("-" * 40)

    try:
        pkg_path = os.path.join(
            r'C:\Users\bharg_4mtuttl\Desktop\BGK_Applications\AI ChatBot',
            'package.json'
        )
        if os.path.exists(pkg_path):
            with open(pkg_path, 'r') as f:
                pkg = json.load(f)
            print(f"✅ Root package.json valid")
            print(f"   Name: {pkg.get('name', 'N/A')}")
            print(f"   Version: {pkg.get('version', 'N/A')}")
            print(f"   Workspaces: {pkg.get('workspaces', 'N/A')}")

            deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}
            if '@my-app/shared-ui' in deps:
                print(f"   ✅ @my-app/shared-ui referenced in dependencies")
            else:
                print(f"   ⚠️ @my-app/shared-ui NOT found in dependencies")
        else:
            print(f"⚠️ package.json not found at expected location")
    except Exception as e:
        print(f"  Error reading package.json: {e}")


if __name__ == '__main__':
    demo_file_metadata()
    demo_enhanced_search()
    demo_backup_workflow()
    demo_template_generation()
    demo_package_validation()

    print("\n" + "=" * 60)
    print("📊 DEMONSTRATION COMPLETE")
    print("=" * 60)
    print("""
Summary of implemented improvements:
✅ File metadata enumeration
✅ Enhanced content search (findstr)
✅ Automated backup workflow
✅ Component template generation
✅ Package configuration validation
""")