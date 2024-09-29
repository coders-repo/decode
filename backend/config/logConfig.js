// Define how each part of a log file line should be mapped
const logConfig = {
    mappings: [
      {
        name: "timestamp",
        regex: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}/, // Regex for the timestamp
        description: "The exact time the log entry was recorded."
      },
      {
        name: "logLevel",
        regex: /(DEBUG|INFO|WARN|ERROR)/, // Regex for log levels
        description: "The level of logging: DEBUG, INFO, WARN, ERROR."
      },
      {
        name: "email",
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/, // Regex for email addresses
        description: "The email address of the user involved in the log."
      },
      {
        name: "key",
        regex: /[A-Za-z0-9_-]{20,}/, // Regex for identifying session keys or unique tokens
        description: "A unique key, token, or identifier for the session or action."
      },
      {
        name: "policyNumber",
        regex: /\b\d{9}\b/, // Regex for identifying 12-digit policy numbers
        description: "A policy number associated with the log entry."
      },
      {
        name: "otherData",
        regex: /\b\d{10,}\b/, // Regex for any other numbers that might represent metadata
        description: "Any other numerical data found in the log."
      }
    ]
  };
  
  module.exports = logConfig;
  
 