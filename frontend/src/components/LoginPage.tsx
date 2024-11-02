import React from 'react';
import { SignIn } from '@clerk/clerk-react';
import { Brain, Github, Linkedin, Mail, Globe } from 'lucide-react';
 
const developerData = {
  name: "Paritosh Tripathi",
  title: "Software Engineer / AI Enthusiast",
  links: [
    { icon: <Github className="w-5 h-5" />, url: "https://github.com/paritoshtripathi935", label: "GitHub" },
    { icon: <Linkedin className="w-5 h-5" />, url: "https://www.linkedin.com/in/a-paritoshtripathi/", label: "LinkedIn" },
    { icon: <Mail className="w-5 h-5" />, url: "mailto:paritosh.tripathi.work@gmail.com", label: "Email" },
    { icon: <Globe className="w-5 h-5" />, url: "http://paritoshtripathi.pythonanywhere.com/", label: "Portfolio" }
  ]
};
 
/**
 * LoginPage component.
 *
 * This component renders the login page, which includes a background with animated
 * particles, a content container with developer information on the left, and a
 * Clerk Sign In component on the right.
 *
 * The developer information section includes a brain icon, name, title, and links
 * to external profiles, such as GitHub, LinkedIn, Email, and Portfolio.
 *
 * The Sign In component is wrapped in a container with a background blur effect.
 *
 * @returns {JSX.Element} The login page component.
 */
const LoginPage: React.FC = () => {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900 overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
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
 
      {/* Content container */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 py-8 grid md:grid-cols-2 gap-8 items-center h-full sm:h-screen">
        {/* Left side - Developer Info */}
        <div className="text-white space-y-6 animate-fade-in flex flex-col items-center md:items-start">
          <div className="flex items-center gap-4">
            <Brain className="w-12 h-12 text-blue-400 animate-pulse" />
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">{developerData.name}</h1>
              <p className="text-lg sm:text-xl text-gray-300">{developerData.title}</p>
            </div>
          </div>
 
          <p className="text-base sm:text-lg text-gray-300">
            Welcome to Mini Perplexity - An AI-powered chat application that combines
            the power of natural language processing with real-time web search capabilities.
          </p>
 
          <div className="flex flex-wrap gap-4">
            {developerData.links.map((link, index) => (
              <a
                key={index}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
              >
                {link.icon}
                <span>{link.label}</span>
              </a>
            ))}
          </div>
        </div>
 
        {/* Right side - Sign In */}
        <div className="flex justify-center items-center h-full">
          {/* Wrapper for SignIn component with background blur */}
          <div className="flex justify-center items-center w-full h-full">
            {/* <div className="w-full max-w-sm sm:max-w-md backdrop-blur-lg bg-white/10 p-6 sm:p-8 rounded-2xl shadow-2xl"> */}
              <SignIn />
            {/* </div> */}
          </div>
        </div>
      </div>
    </div>
  );
};
 
export default LoginPage;