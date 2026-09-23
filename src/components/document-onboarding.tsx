"use client";
import { useEffect, useRef, useState } from "react";
import { CircleHelp, X, ArrowRight } from "lucide-react";
import styles from "./document-workspace.module.css";

const steps = [
  { target:"before", title:"Добавьте документы ДО", text:"Загрузите действующее положение, структуру или несколько файлов в комплект «До изменений»." },
  { target:"after", title:"Добавьте документы ПОСЛЕ", text:"Загрузите новую редакцию в «После изменений». Файлы текущего комплекта видны под зоной загрузки; лишний файл можно убрать из анализа." },
  { target:"process", title:"Постройте и проверьте структуры", text:"Нажмите «Построить структуры». На следующем этапе сравните схемы ДО и ПОСЛЕ, откройте источники при необходимости." },
  { target:"results", title:"Сравните ДО и ПОСЛЕ", text:"Нажмите «Сравнить ДО и ПОСЛЕ». Изучите изменения с доказательствами и вкладку «Рекомендации». Вернуться назад можно через этапы или кнопки под результатом." },
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
    <button ref={trigger} className={styles.onboardingTrigger} aria-expanded={step !== null} aria-controls="document-onboarding" onClick={()=>{manual.current=true;setStep(0);}}><CircleHelp size={16}/>Как это работает?</button>
    {step !== null && <aside id="document-onboarding" className={styles.tourCard} aria-label="Подсказки по документам">
      <div className={styles.tourTop}><span>БЫСТРОЕ ЗНАКОМСТВО · {step+1} / {steps.length}</span><button aria-label="Закрыть подсказки" onClick={dismiss}><X size={18}/></button></div>
      <div aria-live="polite" aria-atomic="true"><h3 ref={heading} tabIndex={-1}>{steps[step].title}</h3><p>{steps[step].text}</p></div>
      <div className={styles.tourActions}><button onClick={dismiss}>Пропустить</button><div>{step>0 && <button onClick={()=>setStep(step-1)}>Назад</button>}<button className={styles.tourNext} onClick={()=>step===steps.length-1 ? dismiss() : setStep(step+1)}>{step===steps.length-1 ? "Понятно" : "Далее"}<ArrowRight size={14}/></button></div></div>
    </aside>}
  </>;
}
