"""
Generate a PyInstaller version info file for Windows.
Run:  python version_info.py
Produces: file_version_info.txt
"""

import PyInstaller.utils.win32.versioninfo as vi

version = vi.VSVersionInfo(
    ffi=vi.FixedFileInfo(
        filevers=(1, 0, 0, 0),
        prodvers=(1, 0, 0, 0),
        mask=0x3F,
        flags=0x0,
        OS=0x40004,          # VOS_NT_WINDOWS32
        fileType=0x1,        # VFT_APP
        subtype=0x0,
    ),
    kids=[
        vi.StringFileInfo([
            vi.StringTable(
                '040904B0',  # US English, Unicode
                [
                    vi.StringStruct('CompanyName', 'CrazyDesk'),
                    vi.StringStruct('FileDescription', 'CrazyDesk Tracker — Team Activity Monitor'),
                    vi.StringStruct('FileVersion', '1.0.0.0'),
                    vi.StringStruct('InternalName', 'CrazyDeskTracker'),
                    vi.StringStruct('LegalCopyright', '© 2026 CrazyDesk. All rights reserved.'),
                    vi.StringStruct('OriginalFilename', 'CrazyDeskTracker.exe'),
                    vi.StringStruct('ProductName', 'CrazyDesk Tracker'),
                    vi.StringStruct('ProductVersion', '1.0.0.0'),
                ],
            )
        ]),
        vi.VarFileInfo([vi.VarStruct('Translation', [1033, 1200])]),
    ],
)

with open('file_version_info.txt', 'w', encoding='utf-8') as f:
    f.write(str(version))

print('Generated file_version_info.txt')
