#!/bin/bash
# 커밋 자동화: ./push.sh "메시지"  (메시지 없으면 날짜로 자동)
MSG=${1:-"update: $(date '+%Y-%m-%d %H:%M')"}
git add .
git commit -m "$MSG"
git push
