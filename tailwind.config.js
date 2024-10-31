module.exports = {
  theme: {
    extend: {
      animation: {
        'fade-out': 'fadeOut 1.5s ease-out forwards',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        fadeOut: {
          '0%': { 
            opacity: '1',
            transform: 'scale(1) translateY(0)',
          },
          '100%': { 
            opacity: '0',
            transform: 'scale(1.1) translateY(-20px)',
          },
        },
        blink: {
          'from, to': { 
            opacity: '1',
          },
          '50%': { 
            opacity: '0',
          },
        },
      },
    },
  },
} 