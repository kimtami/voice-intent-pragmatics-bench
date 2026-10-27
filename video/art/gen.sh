#!/bin/zsh
# Codex 내장 이미지 생성으로 그림 한 장을 만든다 (ChatGPT 계정 로그인 사용).
# 사용: art/gen.sh <이름> [참고 그림...]   프롬프트: art/prompts/<이름>.txt → 결과: art/src/<이름>.png
# 결과 파일은 Codex 세션 id 폴더(~/.codex/generated_images/<id>/)에서 찾는다. 여러 개를 동시에 돌려도 섞이지 않는다.
A="${0:A:h}"; name=$1; shift
args=(); for f in "$@"; do args+=(-i "$f"); done
log="$A/src/$name.log"
codex exec -m gpt-5.6-terra --skip-git-repo-check -s read-only -C "$A" "$(cat "$A/prompts/$name.txt")" "${args[@]}" > "$log" 2>&1 < /dev/null
sid=$(grep -m1 "session id:" "$log" | awk '{print $3}')
out=$(ls -t ~/.codex/generated_images/$sid/*.png 2>/dev/null | head -1)
if [ -n "$out" ]; then cp "$out" "$A/src/$name.png"; echo "$name ok"; else echo "$name FAIL"; grep -v "^hook" "$log" | tail -3; fi
