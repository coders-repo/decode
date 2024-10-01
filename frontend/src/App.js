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

  const [loading, setLoading] = useState(false);

  const apiUrl = process.env.REACT_APP_API_URL;
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
    console.log('message entered');
    if (!input.trim()) return;
    axios.defaults.withCredentials = true;
    const newMessages = [...messages, { text: input, sender: "user" }];
    setMessages(newMessages);
    setInput("");

    // If uploadMode is null, we are handling normal chat input
    console.log('isUploaded',isUploaded)
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
        const response = await axios.post('http://localhost:5001/api/chat-continue', { question: input });
        console.log('response',response);
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
      setLoading(true);
      const response = await axios.post('http://localhost:5001/api/upload-log', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      console.log('Response from server:', response.data);

      // const { analysis, metadata } = response.data;
      setMessages([...messages, { text: 'File uploaded and processed. Here is the analysis:', sender: 'bot' }]);
      setIsUploaded(true); // Mark as uploaded
      setUploadMode(null); // Exit upload mode
    } catch (error) {
      console.error('Error uploading file:', error);
      setMessages([...messages, { text: 'Error uploading file.', sender: 'bot' }]);
    } finally {
      setLoading(false); // Set loading state back to false once request finishes
    }
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
         {/* Loader will appear here when loading is true */}
        {loading && (
          <div className="loading-spinner">
          </div>
        )}
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
