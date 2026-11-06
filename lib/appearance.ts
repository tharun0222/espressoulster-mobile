export const appearanceKey='espressoulster-appearance';
export const themeBootstrap=`try{document.documentElement.dataset.theme=localStorage.getItem('${appearanceKey}')==='dark'?'dark':'light'}catch{document.documentElement.dataset.theme='light'}`;
