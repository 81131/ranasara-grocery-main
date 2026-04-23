import { useState, useEffect, useRef } from "react";
import axios from "axios";

function ChatBot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  
  // --- NEW: State and Refs for Scroll Button ---
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // --- NEW: Scroll Handler ---
  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      // Show button if scrolled up more than 100px from the bottom
      const isScrolledUp = scrollHeight - scrollTop - clientHeight > 100;
      setShowScrollDown(isScrolledUp);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const res = await axios.get("http://localhost:8000/chat/");
      setMessages(res.data);
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const currentInput = input;
    setInput(""); 

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "user", content: currentInput }]);
    setIsTyping(true); 

    try {
      await axios.post("http://localhost:8000/chat/send", {
        content: currentInput
      });
      await fetchMessages();
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => prev.filter(msg => msg.id !== tempId));
    } finally {
      setIsTyping(false); 
    }
  };

  const deleteMessage = async (id) => {
    try {
      await axios.delete(`http://localhost:8000/chat/${id}`);
      await fetchMessages();
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  const submitEdit = async (id) => {
    if (!editContent.trim()) return;
    
    setIsTyping(true);
    
    try {
      await axios.put(`http://localhost:8000/chat/${id}`, {
        content: editContent
      });
      await fetchMessages();
      setEditingId(null);
      setEditContent("");
    } catch (error) {
      console.error("Error updating message:", error);
    } finally {
      setIsTyping(false); 
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return "";
    const utcString = dateString.endsWith('Z') ? dateString : `${dateString}Z`;
    return new Date(utcString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // --- UI RENDERING ---
  return (
    // Outer Background Wrapper (Light, fresh gradient)
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)",
      padding: "20px"
    }}>
      
      {/* The "Device" Container (Clean white) */}
      <div style={{
        width: "100%",
        maxWidth: "400px", 
        height: "800px",
        maxHeight: "90vh",
        backgroundColor: "#ffffff", // Pure white background
        borderRadius: "40px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.15), inset 0 0 0 4px #e4e4e7", // Softer device shadows
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative" 
      }}>
        
        {/* Header Area */}
        <div style={{
          padding: "30px 20px 15px",
          textAlign: "center",
          borderBottom: "1px solid rgba(0,0,0,0.05)", // Soft gray border
          background: "linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0.95) 100%)",
          zIndex: 10
        }}>
          {/* Faux notch/camera hole */}
          <div style={{
            position: "absolute",
            top: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "80px",
            height: "20px",
            backgroundColor: "#e4e4e7", // Light gray notch
            borderRadius: "10px"
          }} />
          
          <h2 style={{ 
            color: "#18181b", // Dark gray text
            margin: "15px 0 0 0", 
            fontSize: "1.1rem", 
            fontWeight: "600",
            letterSpacing: "0.5px"
          }}>
            AI Assistant
          </h2>
          <p style={{ color: "rgba(0,0,0,0.5)", margin: "5px 0 0 0", fontSize: "0.8rem" }}>
            Ransara Supermarket
          </p>
        </div>

        {/* Chat Messages Area */}
        <div 
          ref={chatContainerRef}    
          onScroll={handleScroll}   
          style={{
            flexGrow: 1,
            overflowY: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            scrollbarWidth: "none", 
            msOverflowStyle: "none"
          }}
        >
          
          {/* Welcome Orb */}
          {messages.length === 0 && (
            <div style={{ textAlign: "center", margin: "auto", padding: "20px", marginTop: "40%" }}>
              <img 
                src="https://img.freepik.com/free-vector/chatbot-chat-message-vectorart_78370-4104.jpg?semt=ais_hybrid&w=740&q=80"
                alt="AI Assistant"
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  objectFit: "cover", 
                  margin: "0 auto 20px",
                  boxShadow: "0 10px 25px rgba(37, 99, 235, 0.2)", // Subtle blue glow
                  display: "block"
                }} 
              />
              <h3 style={{ color: "#18181b", fontWeight: "600", lineHeight: "1.4" }}>Hi! I'm your Assistant <br/>How can I help you today?</h3>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} style={{ 
              display: "flex",
              flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              width: "100%"
            }}>
              
              {editingId === msg.id ? (
                // Edit Mode UI
                <div style={{ 
                  backgroundColor: "#f4f4f5", // Light gray editing box
                  padding: "12px", 
                  borderRadius: "18px", 
                  width: "90%",
                  border: "1px solid rgba(0,0,0,0.05)"
                }}>
                  <textarea 
                    value={editContent} 
                    onChange={(e) => setEditContent(e.target.value)} 
                    style={{ 
                      width: "100%", 
                      background: "transparent",
                      border: "none",
                      color: "#18181b", // Dark text
                      outline: "none",
                      resize: "none",
                      minHeight: "40px",
                      fontFamily: "inherit",
                      fontSize: "0.95rem"
                    }}
                    disabled={isTyping}
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" }}>
                    <button onClick={() => setEditingId(null)} style={{ background: "transparent", border: "none", color: "rgba(0,0,0,0.5)", cursor: "pointer", fontSize: "0.8rem" }} disabled={isTyping}>Cancel</button>
                    <button onClick={() => submitEdit(msg.id)} style={{ background: "linear-gradient(135deg, #2563eb, #3b82f6)", border: "none", color: "white", padding: "6px 14px", borderRadius: "12px", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600" }} disabled={isTyping}>Save</button>
                  </div>
                </div>
              ) : (
                // Normal Message Bubble
                <div style={{ 
                  maxWidth: "85%", 
                  // User = Blue bubble, Assistant = Light Gray bubble
                  backgroundColor: msg.role === "user" ? "#2563eb" : "#f4f4f5", 
                  color: msg.role === "user" ? "#ffffff" : "#18181b",
                  padding: "12px 16px", 
                  borderRadius: msg.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                  lineHeight: "1.5",
                  fontSize: "0.95rem",
                  boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
                  border: msg.role === "user" ? "none" : "1px solid rgba(0,0,0,0.05)"
                }}>
                  
                  {(() => {
                    let text = msg.content;
                    let imageUrl = null;
                    let showPayment = false;

                    const imgMatch = text.match(/\[IMAGE:\s*(.*?)\]/);
                    if (imgMatch) {
                      imageUrl = imgMatch[1];
                      text = text.replace(imgMatch[0], "").trim();
                    }

                    if (text.includes("[PAYMENT_TRIGGER]")) {
                      showPayment = true;
                      text = text.replace("[PAYMENT_TRIGGER]", "").trim();
                    }

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
                        
                        {imageUrl && (
                          <img 
                            src={imageUrl} 
                            alt="Product" 
                            style={{ 
                              width: "100%", 
                              height: "180px", 
                              minHeight: "180px", 
                              maxHeight: "180px", 
                              objectFit: "cover", 
                              display: "block",   
                              borderRadius: "12px", 
                              border: "1px solid rgba(0,0,0,0.05)", 
                              marginTop: "5px" 
                            }} 
                          />
                        )}

                        {showPayment && msg.role === "assistant" && (
                          <button 
                            onClick={() => alert("Redirecting to PayHere gateway...")} 
                            style={{
                              background: "linear-gradient(135deg, #00c853, #009624)",
                              color: "white",
                              border: "none",
                              padding: "12px",
                              borderRadius: "12px",
                              fontWeight: "bold",
                              cursor: "pointer",
                              marginTop: "10px",
                              boxShadow: "0 4px 15px rgba(0, 200, 83, 0.2)"
                            }}>
                            Proceed to PayHere Checkout
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Timestamp */}
                  {msg.edited_at && (
                    <div style={{ textAlign: "right", marginTop: "4px" }}>
                      <span style={{ 
                        fontSize: "0.65rem", 
                        // Light text on user blue bubble, dark text on gray bubble
                        color: msg.role === "user" ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.5)" 
                      }}>
                        Edited {formatTime(msg.edited_at)} 
                      </span>
                    </div>
                  )}
                  
                  {/* Edit/Delete Controls */}
                  {msg.role === "user" && !String(msg.id).startsWith("temp") && (
                    <div style={{ marginTop: "10px", display: "flex", gap: "12px", justifyContent: "flex-end", borderTop: "1px solid rgba(0, 0, 0, 0.2)", paddingTop: "8px" }}>
                      <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: "0.75rem", padding: 0 }} disabled={isTyping}>Edit</button>
                      <button onClick={() => deleteMessage(msg.id)} style={{ background: "none", border: "none", color: "#fa2727", cursor: "pointer", fontSize: "0.75rem", padding: 0 }} disabled={isTyping}>Delete</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          
          {/* Typing Animation */}
          {isTyping && (
             <div style={{ alignSelf: "flex-start", backgroundColor: "#f4f4f5", border: "1px solid rgba(0,0,0,0.05)", padding: "16px 20px", borderRadius: "20px 20px 20px 4px" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  <div style={{ width: "6px", height: "6px", backgroundColor: "rgba(0, 0, 0, 0.4)", borderRadius: "50%", animation: "bounce 1.4s infinite ease-in-out both" }}/>
                  <div style={{ width: "6px", height: "6px", backgroundColor: "rgba(0, 0, 0, 0.4)", borderRadius: "50%", animation: "bounce 1.4s infinite ease-in-out both", animationDelay: "0.2s" }}/>
                  <div style={{ width: "6px", height: "6px", backgroundColor: "rgba(0, 0, 0, 0.4)", borderRadius: "50%", animation: "bounce 1.4s infinite ease-in-out both", animationDelay: "0.4s" }}/>
                </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Floating Scroll Down Button */}
        {showScrollDown && (
          <button
            onClick={scrollToBottom}
            style={{
              position: "absolute",
              bottom: "90px", 
              left: "20px",   
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              backgroundColor: "rgba(255, 255, 255, 0.95)", // White circle
              border: "1px solid rgba(0, 0, 0, 0.1)", // Light gray border
              color: "#18181b", // Dark arrow
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 20,
              boxShadow: "0 4px 15px rgba(0,0,0,0.1)", // Softer shadow
              backdropFilter: "blur(4px)",
              transition: "opacity 0.3s ease-in-out"
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v16M5 13l7 7 7-7"/>
            </svg>
          </button>
        )}

        {/* Input Area */}
        <div style={{
          padding: "15px 20px 25px", 
          background: "linear-gradient(to top, rgba(255,255,255,1) 80%, rgba(255,255,255,0) 100%)", // Fades to white
          zIndex: 10
        }}>
          <div style={{ 
            display: "flex", 
            gap: "10px",
            backgroundColor: "#f4f4f5", // Light gray input box
            padding: "8px",
            borderRadius: "30px",
            border: "1px solid rgba(0,0,0,0.05)",
            alignItems: "center"
          }}>
            <input
              style={{ 
                flexGrow: 1, 
                padding: "8px 15px", 
                backgroundColor: "transparent", 
                color: "#18181b", // Dark text
                border: "none", 
                outline: "none",
                fontSize: "0.95rem"
              }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Ask anything..."
              disabled={isTyping} 
            />
            <button 
              onClick={sendMessage} 
              disabled={isTyping || !input.trim()}
              style={{ 
                width: "36px", 
                height: "36px", 
                borderRadius: "50%", 
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: (isTyping || !input.trim()) ? "default" : "pointer", 
                // Blue send button when active, gray when disabled
                backgroundColor: (isTyping || !input.trim()) ? "rgba(0,0,0,0.05)" : "#2563eb", 
                color: (isTyping || !input.trim()) ? "rgba(0,0,0,0.3)" : "white", 
                border: "none",
                transition: "all 0.2s",
                flexShrink: 0
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7"/>
              </svg>
            </button>
          </div>
        </div>

      </div>
      
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}

export default ChatBot;