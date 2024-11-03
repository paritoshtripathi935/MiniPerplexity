import React, { useState } from 'react';
import { SignIn } from '@clerk/clerk-react';
import { Brain, Github, Linkedin, Mail, Globe, Code2, X, MessageCircle } from 'lucide-react';

const developerData = {
  name: "Paritosh Tripathi",
  title: "Software Engineer / AI Enthusiast",
  bio: "Passionate about AI, Machine Learning, and building innovative solutions.",
  links: [
    { icon: <Github className="w-4 h-4" />, url: "https://github.com/paritoshtripathi935", label: "GitHub", text: "@paritoshtripathi935" },
    { icon: <Linkedin className="w-4 h-4" />, url: "https://www.linkedin.com/in/a-paritoshtripathi/", label: "LinkedIn", text: "Paritosh Tripathi" },
    { icon: <Mail className="w-4 h-4" />, url: "mailto:paritosh.tripathi.work@gmail.com", label: "Email", text: "paritosh.tripathi.work@gmail.com" },
    { icon: <Globe className="w-4 h-4" />, url: "http://paritoshtripathi.pythonanywhere.com/", label: "Portfolio", text: "Portfolio Website" },
  ],
};

const LoginPage: React.FC = () => {
  const [showContact, setShowContact] = useState(false);

  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="particle particle-dark"
            style={{
              width: Math.random() * 30 + 10 + 'px',
              height: Math.random() * 30 + 10 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              animationDuration: Math.random() * 20 + 10 + 's',
            }}
          />
        ))}
      </div>

      {/* Contact Modal */}
      {showContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowContact(false)} />
          <div className="relative z-10 bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg p-6 border border-gray-800">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">Connect with Developer</h2>
              <button 
                onClick={() => setShowContact(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">{developerData.name}</h3>
                <p className="text-gray-400">{developerData.bio}</p>
              </div>
              
              <div className="space-y-4">
                {developerData.links.map((link, index) => (
                  <a
                    key={index}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-gray-300 hover:text-blue-400 transition-colors p-3 rounded-lg hover:bg-gray-800/50"
                  >
                    <span className="p-2 bg-gray-800 rounded-lg">{link.icon}</span>
                    <div>
                      <div className="font-medium">{link.label}</div>
                      <div className="text-sm text-gray-400">{link.text}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-grow flex items-center justify-center px-4 py-12">
        <div className="relative z-10 w-full max-w-4xl mx-auto grid md:grid-cols-2 gap-8 items-center">
          {/* Left side - Website Info */}
          <div className="text-white space-y-8 animate-fade-in flex flex-col items-center md:items-start">
            <div className="flex items-center gap-4">
              <Brain className="w-12 h-12 text-blue-400 animate-pulse" />
              <div>
                <h1 className="text-4xl font-bold">Mini Perplexity</h1>
                <p className="text-xl text-gray-300">AI-Powered Search Assistant</p>
              </div>
            </div>
            <div className="space-y-6">
              <p className="text-lg text-gray-300 max-w-lg">
                Experience the next generation of AI-powered search. Get instant, accurate answers with cited sources and context-aware responses.
              </p>
              <button
                onClick={() => setShowContact(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors group"
              >
                <MessageCircle className="w-4 h-4 transition-transform group-hover:scale-110" />
                <span>Reach out to Developer</span>
              </button>
            </div>
          </div>

          {/* Right side - Sign In */}
          <div className="flex justify-center">
            <div className="w-full max-w-sm backdrop-blur-md bg-gray-800/70 p-8 rounded-xl shadow-2xl transform transition-all hover:scale-105">
              <SignIn />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full mt-auto border-t border-gray-800">
        <div className="w-full py-4 bg-gray-900/80 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4">
            <div className="grid grid-cols-1 gap-4 items-center justify-center">

              {/* Project Info */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4" />
                  <a
                    href="https://github.com/paritoshtripathi935/MiniPerplexity"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-400 transition-colors"
                  >
                    Open Source Project
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <span>Made with ❤️ by Paritosh Tripathi</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LoginPage;