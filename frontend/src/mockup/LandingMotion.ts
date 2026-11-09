/** 본문은 기본으로 노출하고, 관찰 기능이 있을 때만 스크롤 등장 효과를 적용한다. */
export function mountLandingMotion(landing: HTMLElement) {
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (media?.matches || !window.IntersectionObserver) return () => {};

  const targets = [...landing.querySelectorAll<HTMLElement>(
    '.lp-how > .lp-section-heading, .lp-preview-surround, .lp-outcomes > .lp-section-heading, .lp-findings, .lp-start-copy, .lp-faq-list, .lp-footer',
  )];
  let observer: IntersectionObserver;
  try {
    observer = new window.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.06, rootMargin: '0px 0px -24px 0px' });
    targets.forEach(target => observer.observe(target));
  } catch {
    // 관찰기를 사용할 수 없어도 페이지의 내용과 링크를 그대로 이용한다.
    return () => {};
  }
  targets.forEach(target => target.classList.add('lp-reveal'));
  landing.classList.add('lp-motion');

  const focus = (event: FocusEvent) => {
    const target = (event.target as Element).closest<HTMLElement>('.lp-reveal');
    if (!target) return;
    target.classList.add('is-visible');
    observer.unobserve(target);
  };
  const preference = () => {
    if (!media?.matches) return;
    targets.forEach(target => target.classList.add('is-visible'));
    observer.disconnect();
  };
  landing.addEventListener('focusin', focus);
  media?.addEventListener('change', preference);

  return () => {
    observer.disconnect();
    landing.classList.remove('lp-motion');
    targets.forEach(target => target.classList.remove('lp-reveal', 'is-visible'));
    landing.removeEventListener('focusin', focus);
    media?.removeEventListener('change', preference);
  };
}
