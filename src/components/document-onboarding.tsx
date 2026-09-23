"use client";
import { useEffect, useRef, useState } from "react";
import { CircleHelp, X, ArrowRight } from "lucide-react";
import styles from "./document-workspace.module.css";

const steps = [
  { target:"before", title:"Начните с исходных документов", text:"В «До изменений» прикрепите действующее положение или структуру. Подойдут DOCX, текстовый PDF и XLSX до 10 МиБ." },
  { target:"after", title:"Добавьте новую редакцию", text:"В «После изменений» загрузите новую версию. В каждом комплекте может быть несколько файлов." },
  { target:"process", title:"Выберите файлы и запустите обработку", text:"В «Изменить выбор» отметьте документы без повторных копий. «Подготовить к сравнению» запустит обработку через OpenAI. Если данные уже готовы, нажмите «Посмотреть результаты»." },
  { target:"results", title:"Откройте структуру и источники", text:"В готовом результате раскройте документ: внутри появятся схема, функции и поиск. Нажмите на узел или функцию, чтобы прочитать цитату. Это извлечение данных; сравнение редакций ещё не выполнено." },
];

export function DocumentOnboarding() {
  const [step, setStep] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const manual = useRef(false);
  const dismiss = () => {
    setStep(null);
    if (manual.current) trigger.current?.focus({ preventScroll:true });
  };
  useEffect(() => {
    const timer = setTimeout(() => setStep(0), 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (step === null) return;
    let target = document.querySelector<HTMLElement>(`[data-onboarding="${steps[step].target}"]`);
    if (!target || !target.getBoundingClientRect().height) target = document.querySelector<HTMLElement>('[data-onboarding="process"]');
    target?.classList.add(styles.tourHighlight);
    target?.scrollIntoView({behavior:"smooth",block:"center"});
    if (manual.current) heading.current?.focus({preventScroll:true});
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") {
      setStep(null); if (manual.current) trigger.current?.focus({preventScroll:true});
    }};
    window.addEventListener("keydown",close);
    return () => {target?.classList.remove(styles.tourHighlight);window.removeEventListener("keydown",close);};
  }, [step]);
  return <>
    <button ref={trigger} className={styles.onboardingTrigger} aria-expanded={step !== null} aria-controls="document-onboarding" onClick={()=>{manual.current=true;setStep(0);}}><CircleHelp size={16}/>Как это работает</button>
    {step !== null && <aside id="document-onboarding" className={styles.tourCard} aria-label="Подсказки по документам">
      <div className={styles.tourTop}><span>БЫСТРОЕ ЗНАКОМСТВО · {step+1} / {steps.length}</span><button aria-label="Закрыть подсказки" onClick={dismiss}><X size={18}/></button></div>
      <div aria-live="polite" aria-atomic="true"><h3 ref={heading} tabIndex={-1}>{steps[step].title}</h3><p>{steps[step].text}</p></div>
      <div className={styles.tourActions}><button onClick={dismiss}>Пропустить</button><div>{step>0 && <button onClick={()=>setStep(step-1)}>Назад</button>}<button className={styles.tourNext} onClick={()=>step===steps.length-1 ? dismiss() : setStep(step+1)}>{step===steps.length-1 ? "Понятно" : "Далее"}<ArrowRight size={14}/></button></div></div>
    </aside>}
  </>;
}
