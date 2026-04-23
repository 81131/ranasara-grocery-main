from sqlalchemy import Column, Integer, ForeignKey
from database import Base

class FeedbackProduct(Base):
    __tablename__ = "feedback_products"

    id = Column(Integer, primary_key=True, index=True)
    feedback_id = Column(Integer, ForeignKey("feedbacks.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)