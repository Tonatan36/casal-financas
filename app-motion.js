import React, { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { motion, useAnimation } from 'https://esm.sh/framer-motion@11.11.17?external=react,react-dom';

function PainelAnimado() {
    const wrapperRef = useRef(null);
    const controls = useAnimation();

    useLayoutEffect(() => {
        const painel = document.getElementById('app-conteudo');
        if (!wrapperRef.current || !painel) {
            throw new Error('Não foi possível inicializar a animação do painel principal.');
        }

        wrapperRef.current.append(painel);

        const animarAbertura = () => {
            controls.set({ opacity: 0, x: 24 });
            controls.start({ opacity: 1, x: 0 }).catch(error => {
                console.error('Erro ao animar a abertura do painel:', error);
            });
        };
        window.addEventListener('app:opened', animarAbertura);

        return () => window.removeEventListener('app:opened', animarAbertura);
    }, [controls]);

    return React.createElement(motion.div, {
        ref: wrapperRef,
        className: 'flex flex-1 flex-col',
        initial: { opacity: 0, x: 24 },
        animate: controls,
        transition: { duration: 0.35, ease: 'easeOut' }
    });
}

const mount = document.getElementById('app-motion-root');
if (!mount) {
    throw new Error('Não foi possível encontrar a área de montagem da animação.');
}

const root = createRoot(mount);
flushSync(() => root.render(React.createElement(PainelAnimado)));
