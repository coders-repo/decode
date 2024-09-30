import React, { useState } from "react";
import axios from "axios";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState(null);
  const [uploadMode, setUploadMode] = useState(null); // Track upload or URL input
  const [isUploaded, setIsUploaded] = useState(false); // Track if the file has been uploaded
  const [logAnalysis, setLogAnalysis] = useState(""); // Store log analysis
  const [parsedAnalysis, setParsedAnalysis] = useState({}); // Store parsed analysis
  const [numberOfFiles, setnumberOfFiles] = useState([]);
  const [visibleItems, setVisibleItems] = useState(5);
  // let url = "C:/Users/dheeraj.kumar/Work/logfiles";

  //URL validation function
  const isValidPathOrUrl = (input) => {
    // Regular expression for a valid Windows file path
    const pathRegex = /^[a-zA-Z]:(\\|\/)([^\\\/:*?"<>|\r\n]+(\\|\/)?)+$/;

    // Check if input is a valid URL
    try {
      new URL(input); // Try creating a URL object
      return true; // If it succeeds, it's a valid URL
    } catch (error) {
      // If it's not a valid URL, check if it's a valid file path
      return pathRegex.test(input); // Return true if it's a valid file path, false otherwise
    }
  };

  // This function is triggered when user sends a message
  const handleSendMessage = async () => {
    if (!input.trim()) return;
    axios.defaults.withCredentials = true;
    const newMessages = [...messages, { text: input, sender: "user" }];
    setMessages(newMessages);
    setInput("");

    // If uploadMode is null, we are handling normal chat input
    if (uploadMode === null && !isUploaded) {
      if (input.toLowerCase() === "yes") {
        setMessages([
          ...newMessages,
          {
            text: "Please upload your log file or provide a URL.",
            sender: "bot",
          },
        ]);
        setUploadMode("upload");
      } else if (input.toLowerCase() === "no") {
        setMessages([
          ...newMessages,
          { text: "Okay, let me know if you need help later.", sender: "bot" },
        ]);
        setUploadMode(null);
      } else {
        if (isValidPathOrUrl(input.toLowerCase())) {
          try {
            const response = await axios.post(
              "http://localhost:5001/api/fileurl",
              { fileUrl: input.toLowerCase() }
            );

            let { fileDetails } = response.data;
            console.log(JSON.stringify(fileDetails));

            setnumberOfFiles(fileDetails);

            setMessages([
              ...newMessages,
              {
                text: `${fileDetails.length} - Files found`,
                fileDetails: fileDetails,
                sender: "bot",
              },
            ]);
          } catch (error) {
            console.error("Error asking question:", error);
          }
        } else {
          setMessages([
            ...newMessages,
            {
              text: 'Please answer "yes" or "no", Or type/paste your URL here ',
              sender: "bot",
            },
          ]);
        }
      }
    }
    // After file is uploaded, user can ask questions about the log file
    else if (isUploaded) {
      try {
        const response = await axios.post(
          "http://localhost:5001/api/chat-continue",
          { question: input }
        );
        const answer = response.data.answer;
        setMessages([...newMessages, { text: answer, sender: "bot" }]);
        console.log("Response:", response.data);
      } catch (error) {
        console.error("Error asking question:", error);
        setMessages([
          ...newMessages,
          { text: "Error processing your question.", sender: "bot" },
        ]);
        if (error.response) {
          // Server responded with a status code outside 2xx
          console.error("Server Response Error:", error.response.status);
          console.error("Server Response Data:", error.response.data);
        } else if (error.request) {
          // Request was made but no response received
          console.error("No Response Received:", error.request);
        } else {
          // Something happened while setting up the request
          console.error("Error", error.message);
        }
      }
    }
  };

  // Function to handle file upload
  const handleFileUpload = async () => {
    axios.defaults.withCredentials = true;
    if (!file) {
      setMessages([
        ...messages,
        { text: "Please select a file before clicking finish.", sender: "bot" },
      ]);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(
        "http://localhost:5001/api/upload-log",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      const analysis = response.data.analysis;
      setMessages([
        ...messages,
        {
          text: "File uploaded and processed. Here is the analysis:",
          sender: "bot",
        },
      ]);
      setLogAnalysis(analysis);
      setParsedAnalysis(parseLogAnalysis(analysis)); // Parse and store the structured log analysis
      setIsUploaded(true); // Mark as uploaded
      setUploadMode(null); // Exit upload mode
    } catch (error) {
      console.error("Error uploading file:", error);
      setMessages([
        ...messages,
        { text: "Error uploading file.", sender: "bot" },
      ]);
    }
  };

  // Function to parse the log analysis string into an object for easy rendering
  const parseLogAnalysis = (analysis) => {
    const errors = [];
    const warnings = [];
    const patterns = [];

    const lines = analysis.split("\n");
    let currentSection = "";

    lines.forEach((line) => {
      if (line.includes("Errors:")) {
        currentSection = "errors";
      } else if (line.includes("Warnings:")) {
        currentSection = "warnings";
      } else if (line.includes("Unusual Patterns:")) {
        currentSection = "patterns";
      } else if (line.trim()) {
        if (currentSection === "errors") {
          errors.push(line);
        } else if (currentSection === "warnings") {
          warnings.push(line);
        } else if (currentSection === "patterns") {
          patterns.push(line);
        }
      }
    });

    return { errors, warnings, patterns };
  };

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const loadMore = () => {
    setVisibleItems((prevVisibleItems) => prevVisibleItems + 5); // Load 5 more items
  };

  console.log(messages);

  return (
    <div className="chat-container">
      <div className="chat-box">
        {/* Log analysis always appears first */}
        {isUploaded && logAnalysis && (
          <div className="message bot">
            <h2>Log Analysis</h2>
            {parsedAnalysis.errors.length > 0 && (
              <div>
                <h3>Errors</h3>
                <ul>
                  {parsedAnalysis.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            {parsedAnalysis.warnings.length > 0 && (
              <div>
                <h3>Warnings</h3>
                <ul>
                  {parsedAnalysis.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {parsedAnalysis.patterns.length > 0 && (
              <div>
                <h3>Unusual Patterns</h3>
                <ul>
                  {parsedAnalysis.patterns.map((pattern, index) => (
                    <li key={index}>{pattern}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Messages always come after the log analysis */}
        {messages.map((message, index) => (
          <>
            <div key={index} className={`message ${message.sender}`}>
              <div>{message.text}</div>
              {message.fileDetails && (
                <ul>
                  {numberOfFiles.slice(0, 5).map((fileNum, ind) => (
                    <li key={fileNum.name}>{fileNum.name}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ))}
      </div>

      {/* Input container remains available for further interaction */}
      <div className="input-container">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
          placeholder={
            isUploaded
              ? "Ask more about the log file..."
              : "Type 'yes' to upload a log file or 'no' to skip..."
          }
        />
        <button onClick={handleSendMessage}>Send</button>
      </div>

      {/* Upload mode UI */}
      {uploadMode === "upload" && !isUploaded && (
        <div className="upload-container">
          <input type="file" onChange={handleFileChange} />
          <button onClick={handleFileUpload}>Finish</button>
        </div>
      )}
    </div>
  );
}

export default App;
