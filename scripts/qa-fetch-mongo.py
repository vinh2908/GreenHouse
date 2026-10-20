"""Fetch only mongod.exe from the official ZIP (skip several hundred MB of PDBs).
zipfile validates the extracted entry's CRC; HTTPS and the fixed official host are required.
"""
import io
import pathlib
import urllib.request
import zipfile

URL = 'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.2.6.zip'

class RemoteZip(io.RawIOBase):
    def __init__(self):
        with urllib.request.urlopen(urllib.request.Request(URL, method='HEAD'), timeout=30) as response:
            self.size = int(response.headers['Content-Length'])
        self.pos = 0

    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos
    def read(self, size=-1):
        size = min(self.size - self.pos, size if size >= 0 else self.size - self.pos)
        if size <= 0: return b''
        request = urllib.request.Request(URL, headers={'Range': f'bytes={self.pos}-{self.pos + size - 1}'})
        with urllib.request.urlopen(request, timeout=180) as response:
            if response.status != 206: raise RuntimeError('Server did not honor byte range')
            data = response.read()
        self.pos += len(data)
        return data

target = pathlib.Path('reports/qa-2026-10-20/tools/mongod.exe')
target.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(RemoteZip()) as archive:
    entry = next(item for item in archive.infolist() if item.filename.endswith('/bin/mongod.exe'))
    print(f'Downloading {entry.compress_size / 1024 / 1024:.1f} MB compressed binary', flush=True)
    target.write_bytes(archive.read(entry))
print(f'Extracted and CRC verified: {target}', flush=True)
