// 스튜디오·렌더용: 저장소의 JSON 을 직접 읽는다
import stages from "../../../site/data/stages.json";
import methods from "../../../site/data/methods.json";
import { makeStages, MethodsJson, StagesJson } from "./scripts";

export const STAGES = makeStages(stages as unknown as StagesJson, methods as unknown as MethodsJson);
