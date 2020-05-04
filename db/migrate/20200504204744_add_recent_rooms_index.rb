class AddRecentRoomsIndex < ActiveRecord::Migration[5.2]
  def change
    add_index :rooms, [:account_id, :updated_at]
  end
end
