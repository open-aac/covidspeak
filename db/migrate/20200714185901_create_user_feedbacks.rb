class CreateUserFeedbacks < ActiveRecord::Migration[5.2]
  def change
    create_table :user_feedbacks do |t|
      t.text :settings
      t.string :ref_id
      t.timestamps
    end
    add_index :user_feedbacks, [:ref_id, :created_at]
  end
end
