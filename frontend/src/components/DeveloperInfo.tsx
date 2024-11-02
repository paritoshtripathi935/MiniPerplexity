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
    title: "Software Engineer/ AI Enthusiast",
    description: "Passionate about building innovative AI-powered applications and creating seamless user experiences.",
    skills: [
        "Python", "Java", "C/C++", "SQL",
        "AWS", "GCP", "Azure", "Docker", "Jenkins", "Heroku",
        "Web Scraping", "Data Mining", "NLP", "ML", "AI",
        "Django", "FastAPI", "PySpark", "Hadoop",
        "TensorFlow", "scikit-learn", "Keras", "Jira",
        "PostgreSQL", "MongoDB",
        "Visual Studio Code", "Git", "GitHub"
     ],
     
    links: [
      { icon: <Github className="w-5 h-5" />, url: "https://github.com/paritoshtripathi935", label: "GitHub" },
      { icon: <Linkedin className="w-5 h-5" />, url: "https://www.linkedin.com/in/a-paritoshtripathi/", label: "LinkedIn" },
      { icon: <Mail className="w-5 h-5" />, url: "mailto:paritosh.tripathi.work@gmail.com", label: "Email" },
      { icon: <Globe className="w-5 h-5" />, url: "http://paritoshtripathi.pythonanywhere.com/", label: "Portfolio" }
    ]
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className={`rounded-xl shadow-lg p-8 ${
          darkMode ? 'bg-gray-800' : 'bg-white'
        }`}>
          <div className="flex items-center gap-4 mb-6">
            <Brain className={`w-12 h-12 ${darkMode ? 'text-blue-400' : 'text-blue-600'} brain-icon`} />
            <div>
              <h1 className="text-3xl font-bold">{developerData.name}</h1>
              <p className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {developerData.title}
              </p>
            </div>
          </div>

          <p className={`text-lg mb-8 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {developerData.description}
          </p>

          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {developerData.skills.map((skill, index) => (
                <span
                  key={index}
                  className={`px-3 py-1 rounded-full text-sm ${
                    darkMode 
                      ? 'bg-gray-700 text-blue-300'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Connect</h2>
            <div className="flex flex-wrap gap-4">
              {developerData.links.map((link, index) => (
                <a
                  key={index}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    darkMode
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-100'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                  }`}
                >
                  {link.icon}
                  <span>{link.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeveloperInfo; 