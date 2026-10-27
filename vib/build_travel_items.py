"""6차 여행 세트 문항. 여행자 기억(data/travel/travelers.json)을 고정한 뒤에 썼다.

짝 문항은 상태·직전 대화·발화가 같고 여행자만 달라서, 기억을 봐야 정답이 갈린다. 대조 문항은 의도가 발화 안에 있어
기억이 필요 없다(기억을 넣었을 때 잘못된 행동이나 되묻기가 늘지 않는지 본다). relevant 는 그 문항의 의도를 가르는 기억이다.

되묻기 규칙(clarify_ok): 예약·결제·발송·계획 변경 제안, 그리고 사용자가 아직 답하지 않은 비서 제안을 다시 확인하는 것은 허용(true).
조회·안내·설정과 사용자가 이미 승낙한 행동은 바로 실행(false).

  python -m vib.build_travel_items   # data/travel/items.json 생성 (relevant 가 기억에 실제로 있는지 검사)
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

A = "assistant"
PAIRS = [
    {   # 같은 말이 수락도 거절도 된다: 선호(꼭 먹을 음식) 대 제약(동행의 알레르기)
        "pair": "P1", "pair_type": "제약·선호 (수락 대 거절)", "category": "implicature",
        "state": "숙소. 11월 6일 저녁 6시.",
        "context": [{"role": A, "content": "근처 저녁 식당으로 '모살물항'이 평점이 높아요. 꽃게탕이 유명한 해산물 집이에요. 예약할까요?"}],
        "utterance": "음 해산물이네",
        "sides": {
            "B": {"gold_intent": "제주에서 꼭 먹으려던 꽃게탕 집이라 반기는 말. 수락하고 예약을 원함",
                  "must": ["'모살물항' 예약을 진행하거나, 예약할지 콕 집어 확인한다"],
                  "must_not": ["다른 식당으로 바꾼다", "해산물을 피해야 하는 것으로 받아들인다"], "clarify_ok": True,
                  "relevant": ["10-16 저장: 제주 가면 꼭 먹을 것: 꽃게탕, 고등어회, 갈치조림", "10-18 검색: 제주 꽃게탕 맛집"]},
            "D": {"gold_intent": "아내가 갑각류(새우·게) 알레르기라 꽃게탕 집은 곤란하다는 말. 이 식당은 거절하고 갑각류 없는 다른 식당을 원함",
                  "must": ["'모살물항'을 예약하지 않는다", "갑각류가 없는 다른 식당을 찾거나 제안한다"],
                  "must_not": ["그대로 예약을 진행한다"], "clarify_ok": True,
                  "relevant": ["10-12 메시지(아내): '나 갑각류 알레르기 있는 거 알지? 새우·게는 진짜 안 돼'",
                               "10-15 검색: 갑각류 알레르기 식당 메뉴 확인"]},
        },
    },
    {   # 동행 조건이 있으면 함축, 없으면 문자 그대로의 질문
        "pair": "P2", "pair_type": "문자 대 함축", "category": "implicature",
        "state": "숙소 앞. 11월 6일 오전 10시.",
        "context": [{"role": A, "content": "오늘 오전 산책 코스로 '엉또폭포' 어떠세요? 주차장에서 폭포까지 걸어가는 길이 있어요. 길 안내할까요?"}],
        "utterance": "거기 계단 많지 않나",
        "sides": {
            "A": {"gold_intent": "아이를 유모차에 태워 다녀야 해서 계단 많은 길은 곤란하다는 함축. 유모차로 갈 수 있는지 확인하고, 어려우면 유모차로 다니기 좋은 다른 산책 코스를 원함",
                  "must": ["유모차(아이 동반)를 고려해 답한다: 유모차로 갈 수 있는지 알려 주거나 유모차로 다니기 좋은 다른 코스를 제안한다"],
                  "must_not": ["유모차·아이를 고려하지 않고 그대로 길안내를 시작한다"], "clarify_ok": True,
                  "relevant": ["10-14 저장: 유모차로 다니기 좋은 제주 평지 산책로 모음",
                               "10-17 메시지(남편): '유모차 꼭 챙기자 애 아직 오래 못 걸어'"]},
            "B": {"gold_intent": "계단이 얼마나 되는지 묻는 정보 질문. 걷는 여행을 즐기므로 코스를 바꿀 이유가 없음. 계단·경사 정도를 알려 주고 안내를 이어가면 됨",
                  "must": ["계단·경사 정도에 대해 답한다"],
                  "must_not": ["묻지 않았는데 다른 코스로 바꾼다", "유모차·아이·노약자처럼 사용자에게 없는 조건을 끌어온다"], "clarify_ok": True,
                  "relevant": ["10-13 저장: 올레길 7코스, 10코스"]},
        },
    },
    {   # '저장해 둔 데' 가 누구의 기억이냐에 따라 다른 곳
        "pair": "P3", "pair_type": "저장 항목 지시", "category": "ellipsis_deixis",
        "state": "숙소 앞. 11월 6일 오전 11시 반.",
        "context": [{"role": A, "content": "점심 드실 곳 찾아볼까요?"}],
        "utterance": "아 저번에 저장해 둔 데 있잖아 거기로 가자",
        "sides": {
            "A": {"gold_intent": "저장해 둔 식당 '돌담키즈밥상'으로 가자는 요청. 길안내를 원함",
                  "must": ["'돌담키즈밥상'으로 길안내를 시작한다"],
                  "must_not": ["다른 장소로 안내한다", "어느 곳인지 되묻기만 한다"], "clarify_ok": False,
                  "relevant": ["10-24 저장: 식당 '돌담키즈밥상' (아이 의자·놀이방 있음)"]},
            "B": {"gold_intent": "저장해 둔 식당 '바당고등어회'로 가자는 요청. 길안내를 원함 (대중교통 경로 가능)",
                  "must": ["'바당고등어회'로 길안내를 시작한다"],
                  "must_not": ["다른 장소로 안내한다", "어느 곳인지 되묻기만 한다"], "clarify_ok": False,
                  "relevant": ["10-21 저장: 식당 '바당고등어회'"]},
        },
    },
    {   # '그거' 가 기억 속 다른 물건
        "pair": "P4", "pair_type": "기억 속 대상 지시", "category": "ellipsis_deixis",
        "state": "제주공항 도착장. 11월 5일 오후 2시.",
        "context": [{"role": A, "content": "공항 근처 렌터카 업체에 지금 바로 빌릴 수 있는 소형 SUV가 있어요. 예약할까요?"}],
        "utterance": "응 해 줘 아 그리고 차 빌릴 때 그거 꼭 챙겨 줘",
        "sides": {
            "A": {"gold_intent": "소형 SUV 예약을 진행하고, '그거' 는 유아 카시트. 카시트를 함께 신청해 달라는 요청",
                  "must": ["렌터카 예약을 진행한다", "유아용 카시트를 함께 신청한다"],
                  "must_not": ["카시트 없이 예약만 진행한다", "'그거'가 무엇인지 되묻기만 한다"], "clarify_ok": False,
                  "relevant": ["10-20 메모: 렌터카 빌릴 때 카시트 꼭 신청하기", "10-22 검색: 렌터카 유아 카시트 의무"]},
            "C": {"gold_intent": "소형 SUV 예약을 진행하고, '그거' 는 법인 계약 코드. 코드 JEJU-2611 을 적용해 달라는 요청",
                  "must": ["렌터카 예약을 진행한다", "법인 계약 코드 JEJU-2611 을 적용한다"],
                  "must_not": ["코드 없이 예약만 진행한다", "'그거'가 무엇인지 되묻기만 한다"], "clarify_ok": False,
                  "relevant": ["10-13 메일(총무팀): 출장 렌터카는 법인 계약 코드 JEJU-2611 을 입력해야 비용 처리 가능"]},
        },
    },
    {
        "pair": "P5", "pair_type": "기억 속 대상 지시", "category": "ellipsis_deixis",
        "state": "렌터카 반납 장소. 11월 8일 오전 10시.",
        "context": [{"role": A, "content": "렌터카 요금 12만 4천 원을 결제할게요. 등록된 카드는 개인 신용카드, 법인카드, 공동 통장 체크카드가 있어요. 어느 카드로 할까요?"}],
        "utterance": "이번엔 그 카드로 해 줘",
        "sides": {
            "C": {"gold_intent": "출장 규정상 교통비는 법인카드로 결제해야 하므로 법인카드로 결제",
                  "must": ["법인카드로 결제한다 (또는 법인카드로 결제할지 콕 집어 확인한다)"],
                  "must_not": ["다른 카드로 결제한다"], "clarify_ok": True,
                  "relevant": ["10-09 메일(총무팀): 출장비 규정 — 숙박 1박 15만 원 한도, 교통·숙박은 법인카드 결제"]},
            "D": {"gold_intent": "신혼여행 경비는 공동 통장 체크카드로 쓰기로 했으므로 그 카드로 결제",
                  "must": ["공동 통장 체크카드로 결제한다 (또는 그 카드로 결제할지 콕 집어 확인한다)"],
                  "must_not": ["다른 카드로 결제한다"], "clarify_ok": True,
                  "relevant": ["10-17 메모: 신혼여행 경비는 공동 통장 체크카드로 쓰기로 함"]},
        },
    },
    {   # '그거' 와 알람 시각이 기억에서 나온다
        "pair": "P6", "pair_type": "기억 속 대상 지시 (값)", "category": "ellipsis_deixis",
        "state": "숙소. 11월 6일 밤 10시.",
        "context": [],
        "utterance": "내일 그거 맞춰서 알람 좀 해 줘",
        "sides": {
            "B": {"gold_intent": "'그거' 는 내일(11/7) 성산일출봉 일출(06:58). 숙소에서 정상까지 40분이므로 그보다 충분히 이른 시각에 알람",
                  "must": ["내일 일출(06:58)을 보러 가기에 늦지 않은 이른 아침(늦어도 6시 10분 이전)으로 알람을 설정한다"],
                  "must_not": ["일출과 무관한 시각으로 설정한다", "몇 시에 맞출지 되묻기만 한다"], "clarify_ok": False,
                  "relevant": ["10-26 메모: 11/7 성산일출봉 일출 보기 (일출 06:58, 숙소에서 정상까지 40분)",
                               "10-23 저장: 성산일출봉 일출 명소"]},
            "D": {"gold_intent": "'그거' 는 내일(11/7) 오전 9시 스냅 촬영. 헤어·메이크업이 7시 30분에 숙소로 오므로 그 전에 일어나도록 알람",
                  "must": ["헤어·메이크업(7:30) 전에 준비할 수 있는 시각(늦어도 7시 15분 이전)으로 알람을 설정한다"],
                  "must_not": ["촬영과 무관한 시각으로 설정한다", "몇 시에 맞출지 되묻기만 한다"], "clarify_ok": False,
                  "relevant": ["10-19 예약: 11/7 오전 9시 협재해변 웨딩 스냅 촬영 (헤어·메이크업 7:30 숙소 방문)"]},
        },
    },
    {   # 같은 '비싸다' 지만 한도가 다르다
        "pair": "P7", "pair_type": "수치 한도", "category": "implicature",
        "state": "제주시. 11월 5일 오후 5시.",
        "context": [{"role": A, "content": "오늘 밤 묵을 곳으로 '오션스테이 호텔'에 빈방이 있어요. 1박 18만 원이에요. 예약할까요?"}],
        "utterance": "음 좀 비싸지 않나",
        "sides": {
            "B": {"gold_intent": "하루 예산이 5만 원(숙소 포함)이라 18만 원 호텔은 안 됨. 예약하지 않고 게스트하우스 등 훨씬 싼 숙소(1박 3만 원 안팎)를 원함",
                  "must": ["이 호텔을 예약하지 않는다", "예산에 맞는 훨씬 저렴한 숙소(게스트하우스 등, 1박 3만 원 안팎)를 찾거나 제안한다"],
                  "must_not": ["그대로 예약한다", "1박 10만 원대 숙소를 대안으로 낸다"], "clarify_ok": True,
                  "relevant": ["10-08 메모: 여행 예산 하루 5만 원 (숙소 포함)", "10-10 검색: 제주 게스트하우스 2만 원대"]},
            "C": {"gold_intent": "출장비 숙박 한도(1박 15만 원)를 넘음. 예약하지 않고 1박 15만 원 이하 숙소를 원함",
                  "must": ["이 호텔을 예약하지 않는다", "1박 15만 원 이하 숙소를 찾거나 제안한다"],
                  "must_not": ["그대로 예약한다", "1박 15만 원을 넘는 숙소를 대안으로 낸다"], "clarify_ok": True,
                  "relevant": ["10-09 메일(총무팀): 출장비 규정 — 숙박 1박 15만 원 한도, 교통·숙박은 법인카드 결제"]},
        },
    },
    {   # 곧 화상회의가 있으면 함축, 없으면 문자 그대로의 질문
        "pair": "P8", "pair_type": "문자 대 함축", "category": "implicature",
        "state": "카페 앞. 11월 6일 오후 3시.",
        "context": [{"role": A, "content": "근처에 바다가 보이는 카페 '봄날'이 있어요. 지금 자리가 있대요. 여기로 갈까요?"}],
        "utterance": "거기 와이파이 잘 되나",
        "sides": {
            "C": {"gold_intent": "한 시간 뒤(오후 4시) 고객사 화상회의·발표를 그 카페에서 해야 해서 와이파이가 중요하다는 함축. 화상회의를 할 수 있는 곳인지 확인하고, 어려우면 작업하기 좋은 다른 곳을 원함",
                  "must": ["와이파이를 확인해 답한다", "오후 4시 화상회의를 고려해 답한다 (회의에 적합한지 언급하거나 작업하기 좋은 다른 곳을 제안한다)"],
                  "must_not": ["화상회의를 고려하지 않고 그대로 안내만 한다"], "clarify_ok": True,
                  "relevant": ["10-17 메일(고객사): 11/6 오후 4시 화상회의 링크 (본사 연결, 발표 20분)",
                               "10-20 저장: 노트북 작업하기 좋은 제주시 카페 모음"]},
            "D": {"gold_intent": "와이파이가 되는지 묻는 정보 질문. 와이파이 여부를 답하고 안내를 이어가면 됨",
                  "must": ["와이파이 여부를 답한다"],
                  "must_not": ["업무·회의처럼 사용자에게 없는 조건을 끌어온다", "묻지 않았는데 다른 카페로 바꾼다"], "clarify_ok": True,
                  "relevant": []},
        },
    },
]

CONTROLS = [  # 의도가 발화 안에 있어 기억이 필요 없는 문항
    {"id": "T-CT-A", "traveler": "A", "category": "self_repair", "state": "숙소. 11월 6일 밤 9시.", "context": [],
     "utterance": "내일 아 아니 모레 아침 여덟 시에 렌터카 반납 알림 해 줘",
     "gold_intent": "모레(11월 8일) 오전 8시 렌터카 반납 알림 설정 (내일은 정정됨)",
     "must": ["11월 8일(모레) 오전 8시 알림을 설정한다"], "must_not": ["11월 7일(내일)로 설정한다"], "clarify_ok": False},
    {"id": "T-CT-B", "traveler": "B", "category": "ellipsis_deixis", "state": "게스트하우스. 11월 6일 저녁 8시.",
     "context": [{"role": "user", "content": "엄마한테 오늘 잘 도착했다고 문자 보내 줘"},
                 {"role": A, "content": "어머니께 '오늘 잘 도착했어요'라고 보냈어요."}],
     "utterance": "아빠한테도",
     "gold_intent": "아빠에게도 같은 내용('오늘 잘 도착했어요')의 문자를 보내 달라는 요청",
     "must": ["아빠에게 잘 도착했다는 같은 내용의 문자를 보낸다"], "must_not": ["다른 내용을 보낸다", "누구에게 보낼지 되묻는다"],
     "clarify_ok": True},
    {"id": "T-CT-C", "traveler": "C", "category": "ellipsis_deixis", "state": "호텔 방. 11월 5일 밤 10시. 에어컨 냉방 24도.",
     "context": [{"role": "user", "content": "에어컨 온도 좀 낮춰 줘"}, {"role": A, "content": "에어컨 온도를 24도로 낮췄어요."}],
     "utterance": "아니 좀 더",
     "gold_intent": "온도를 24도보다 더 낮춰 달라는 요청 (예: 22~23도)",
     "must": ["에어컨 온도를 24도보다 더 낮춘다"], "must_not": ["온도를 올린다", "얼마나 낮출지 되묻기만 한다"], "clarify_ok": False},
    {"id": "T-CT-D", "traveler": "D", "category": "honorific", "state": "숙소. 11월 5일 저녁 7시.", "context": [],
     "utterance": "어머님께 잘 도착했다고 문자 드려 줘",
     "gold_intent": "시어머니(어머님)께 높임말로 잘 도착했다는 문자를 보내 달라는 요청",
     "must": ["어머님께 높임말로 잘 도착했다는 문자를 보낸다"], "must_not": ["반말로 보낸다", "다른 사람에게 보낸다"],
     "clarify_ok": True},
]


def main() -> None:
    trav = json.loads((ROOT / "data" / "travel" / "travelers.json").read_text(encoding="utf-8"))["travelers"]
    items = []
    for p in PAIRS:
        for tid, side in p["sides"].items():
            for r in side["relevant"]:  # 결정적 기억이 실제로 그 여행자의 기억에 있는지
                assert r in trav[tid]["memories"], (p["pair"], tid, r)
            items.append({"id": f"T-{p['pair']}-{tid}", "traveler": tid, "pair": p["pair"], "pair_type": p["pair_type"],
                          "category": p["category"], "state": p["state"], "context": p["context"], "utterance": p["utterance"],
                          **{k: side[k] for k in ("gold_intent", "must", "must_not", "clarify_ok")}, "relevant": side["relevant"]})
    for c in CONTROLS:
        items.append({**c, "pair": None, "pair_type": "대조 (기억 무관)", "relevant": []})
    path = ROOT / "data" / "travel" / "items.json"
    path.write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("ok", len(items), "items;", sum(1 for i in items if i["pair"]), "paired")


if __name__ == "__main__":
    main()
