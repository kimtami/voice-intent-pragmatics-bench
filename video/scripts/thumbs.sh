#!/bin/zsh
# 문제점 카드용 썸네일: 방법마다 무대의 끝 화면을 480×320 WebP 로 site/media/stage/thumbs/ 에 쓴다.
# 방법을 더했거나 무대 코드를 바꿨을 때 다시 돌린다: npm run thumbs
cd "${0:A:h}/.."
mkdir -p out/thumbs ../site/media/stage/thumbs
npx remotion compositions src/index.ts 2>/dev/null | awk '/^m-/{print $1, $4}' | while read id n; do
  npx remotion still src/index.ts $id out/thumbs/$id.png --frame=$(( n - 1 )) --scale=0.3125 >/dev/null 2>&1 || echo "fail $id"
done
python3 -c "
from pathlib import Path
from PIL import Image
for p in sorted(Path('out/thumbs').glob('m-*.png')):
    Image.open(p).convert('RGB').save(Path('../site/media/stage/thumbs')/(p.stem+'.webp'), 'WEBP', quality=82, method=6)
print(len(list(Path('../site/media/stage/thumbs').glob('*.webp'))), 'thumbs')
"
