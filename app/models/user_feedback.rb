class UserFeedback < ApplicationRecord
  include SecureSerialize
  secure_serialize :settings
  before_save :generate_defaults
  after_save :deliver_if_feedback

  def generate_defaults
    self.settings ||= {}
  end

  def deliver_if_feedback
    if !self.settings['feedback'].blank?
      feedback_hash = Digest::MD5.hexdigest(self.settings['feedback'] || 'no feedback')
      # don't repeat notifications, please
      if !self.settings['feedback'].blank? && self.settings['feedback_hash'] != feedback_hash
        self.settings['feedback_hash'] = feedback_hash
        self.save
        AccountMailer.deliver_message('call_feedback', self)
      end
    end
  end

  def self.process(params)
    params['ref_id'] ||= "ow#{rand(99999)}:#{Time.now.to_i}"
    feedback = UserFeedback.where(['created_at > ?', 24.hours.ago]).find_or_create_by(ref_id: params['ref_id'])
    feedback.settings['stars'] = params['stars'].to_i
    feedback.settings['feedback'] = params['feedback'].to_s unless params['feedback'].blank?
    feedback.settings['system'] = params['system'].to_s unless params['system'].blank?
    feedback.settings['browser'] = params['browser'].to_s unless params['browser'].blank?
    feedback.settings['mobile'] = params['mobile'] == true || params['mobile'] == 'true'
    feedback.save
    feedback
  end
end
