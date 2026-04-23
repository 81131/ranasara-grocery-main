from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class FeedbackProduct(Base):
    """Junction table linking feedback to multiple products."""
    __tablename__ = "feedback_products"

    id = Column(Integer, primary_key=True, index=True)
    feedback_id = Column(Integer, ForeignKey("feedbacks.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    
    # Relationships for convenience
    feedback = relationship("Feedback", back_populates="products")
    product = relationship("Product")