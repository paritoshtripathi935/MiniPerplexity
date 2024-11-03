import React from 'react';
import { Brain, Github, Linkedin, Mail, Globe } from 'lucide-react';

interface DeveloperInfoProps {
  darkMode: boolean;
}

/**
 * DeveloperInfo component.
 *
 * This component displays detailed information about the developer, Paritosh Tripathi,
 * including name, title, description, skills, and links to external profiles.
 * It supports dark and light modes for styling.
 *
 * Props:
 * - darkMode (boolean): Determines whether the component is rendered in dark mode.
 *
 * The component uses Tailwind CSS for styling and includes icons from lucide-react
 * for external profile links, such as GitHub, LinkedIn, Email, and Portfolio.
 */
const DeveloperInfo: React.FC<DeveloperInfoProps> = ({ darkMode }) => {
  const developerData = {
    name: "Paritosh Tripathi",
    title: "Software Engineer / AI Enthusiast",
    bio: "Passionate about AI, Machine Learning, and building innovative solutions.",
    links: [
      { icon: <Github className="w-4 h-4" />, url: "https://github.com/paritoshtripathi935", label: "GitHub", text: "@paritoshtripathi935" },
      { icon: <Linkedin className="w-4 h-4" />, url: "https://www.linkedin.com/in/a-paritoshtripathi/", label: "LinkedIn", text: "Paritosh Tripathi" },
      { icon: <Mail className="w-4 h-4" />, url: "mailto:paritosh.tripathi.work@gmail.com", label: "Email", text: "paritosh.tripathi.work@gmail.com" },
      { icon: <Globe className="w-4 h-4" />, url: "http://paritoshtripathi.pythonanywhere.com/", label: "Portfolio", text: "Portfolio Website" },
    ]
  };

  return (
    <div className={`w-full max-w-2xl mx-auto ${darkMode ? 'text-white' : 'text-gray-900'}`}>
      <div className={`rounded-xl shadow-lg p-6 ${
        darkMode ? 'bg-gray-800/70 backdrop-blur-md' : 'bg-white'
      }`}>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Brain className={`w-8 h-8 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          <div>
            <h3 className="text-xl font-semibold">{developerData.name}</h3>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {developerData.title}
            </p>
          </div>
        </div>

        {/* Bio */}
        <p className={`text-sm mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {developerData.bio}
        </p>

        {/* Links */}
        <div className="space-y-3">
          {developerData.links.map((link, index) => (
            <a
              key={index}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                darkMode 
                  ? 'text-gray-300 hover:text-blue-400 hover:bg-gray-700/50' 
                  : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100'
              }`}
            >
              <span className={`p-2 rounded-lg ${
                darkMode ? 'bg-gray-700' : 'bg-gray-100'
              }`}>
                {link.icon}
              </span>
              <div>
                <div className="font-medium">{link.label}</div>
                <div className={`text-xs ${
                  darkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {link.text}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DeveloperInfo; 